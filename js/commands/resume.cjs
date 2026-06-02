const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getDownloadLinks, metrics } = require('../fetchUtils.cjs');
const {
  readRestorationState,
  writeRestorationState,
} = require('../restorationState.cjs');
const {
  ensureIndexFile,
  generateOutputFileName,
  indexBAM,
  indexVCF,
  rangedDownloadBAM,
  rangedDownloadVCF,
} = require('../rangedUtils.cjs');
const { downloadFile } = require('../fileUtils.cjs');
const { getErrorMessage } = require('../errorUtils.cjs');

/**
 * Resumes downloads for archived files as specified in the awaiting-restoration JSON file.
 * For each entry, if the current time is past the restoreEstimation, it attempts to download the file
 * using the restored context options. On success, the entry is removed; otherwise, it is kept for later resumption.
 * @param   {string}                            restorationFile - The path/name of the awaiting-restoration JSON file.
 * @param   {string}                            destination     - The destination folder for downloads.
 * @param   {string}                            target          - The Varvis API target.
 * @param   {string}                            token           - The CSRF token for authentication.
 * @param   {import('../types').HttpDispatcher} agent           - The HTTP agent instance.
 * @param   {import('winston').Logger}          logger          - The logger instance.
 * @param   {boolean}                           overwrite       - Flag indicating whether to overwrite existing files.
 * @returns {Promise<void>}
 */
async function resumeArchivedDownloads(
  restorationFile,
  destination,
  target,
  token,
  agent,
  logger,
  overwrite,
) {
  const data = readRestorationState(restorationFile, logger);
  if (!data) {
    logger.info(
      `No restoration entries could be loaded from ${restorationFile}. Nothing to resume.`,
    );
    return;
  }

  /** @type {import('../types').RestorationEntry[]} */
  let updatedData = [];
  const now = new Date();

  for (const entry of data) {
    // Check if restoration time has passed
    if (!entry.restoreEstimation || new Date(entry.restoreEstimation) > now) {
      // Keep entries that aren't ready yet
      updatedData.push(entry);
      continue;
    }

    logger.info(
      `Resuming download for analysis ${entry.analysisId}, file ${entry.fileName}`,
    );

    try {
      // Re-hydrate context from saved options
      const restoredOptions = entry.options || {};
      const effectiveDestination = restoredOptions.destination || destination;
      const effectiveOverwrite =
        restoredOptions.overwrite !== undefined
          ? restoredOptions.overwrite
          : overwrite;
      const effectiveFiletypes = restoredOptions.filetypes || null; // Use saved filetypes

      // Fetch fresh links with "no" restore option to prevent re-triggering restoration
      const fileDict = await getDownloadLinks(
        entry.analysisId,
        effectiveFiletypes, // Use restored filetypes filter
        target,
        token,
        agent,
        logger,
        'no', // Important: use "no" to prevent re-triggering restoration
        null,
        null,
        null,
      );

      // Check if file is still archived or not found
      if (!(entry.fileName in fileDict)) {
        logger.warn(
          `File ${entry.fileName} not found or still archived for analysis ${entry.analysisId}. Keeping for retry.`,
        );
        updatedData.push(entry);
        continue;
      }

      const file = fileDict[entry.fileName];
      if (file.currentlyArchived) {
        logger.warn(
          `File ${entry.fileName} is still archived for analysis ${entry.analysisId}. Keeping for retry.`,
        );
        updatedData.push(entry);
        continue;
      }

      const downloadLink = file.downloadLink;
      if (!downloadLink) {
        logger.warn(
          `File ${entry.fileName} has no download link for analysis ${entry.analysisId}. Keeping for retry.`,
        );
        updatedData.push(entry);
        continue;
      }

      // Handle genomic ranges from restored options
      /** @type {string[]} */
      let regions = [];
      if (restoredOptions.range) {
        regions = restoredOptions.range.split(' ');
      } else if (restoredOptions.bed) {
        try {
          const bedFileContent = fs.readFileSync(restoredOptions.bed, 'utf8');
          regions = bedFileContent
            .split('\n')
            .filter((line) => line && !line.startsWith('#'))
            .map((line) => {
              const [chr, start, end] = line.split('\t');
              return `${chr}:${start}-${end}`;
            });
        } catch (bedError) {
          logger.warn(
            `Error reading BED file ${restoredOptions.bed}: ${getErrorMessage(bedError)}. Proceeding with full download.`,
          );
        }
      }

      // Generate output filename using restored context
      const outputFile = path.join(
        effectiveDestination,
        generateOutputFileName(entry.fileName, regions, logger),
      );

      // Handle BAM files
      if (entry.fileName.endsWith('.bam')) {
        const indexFileUrl = fileDict[`${entry.fileName}.bai`]?.downloadLink;

        // Perform ranged or full download based on restored options
        if (regions.length > 0) {
          if (!indexFileUrl) {
            logger.error(
              `Index file for BAM ${entry.fileName} not found for analysis ${entry.analysisId}. Ranged download requires .bai index. Keeping for retry.`,
            );
            updatedData.push(entry);
            continue;
          }
          const indexFileName = generateOutputFileName(
            `${entry.fileName}.bai`,
            regions,
            logger,
          );
          const indexFilePath = path.join(effectiveDestination, indexFileName);

          // Ensure index file is downloaded
          await ensureIndexFile(
            downloadLink,
            indexFileUrl,
            indexFilePath,
            agent,
            null, // no rl needed
            logger,
            metrics,
            effectiveOverwrite,
          );

          // Create temporary BED file for ranged download
          const tempBedPath = path.join(
            os.tmpdir(),
            `restore-regions-${Date.now()}.bed`,
          );
          const bedContent = regions
            .map((region) => {
              const [chr, pos] = region.split(':');
              const [start, end] = pos.split('-');
              return `${chr}\t${start}\t${end}`;
            })
            .join('\n');

          fs.writeFileSync(tempBedPath, bedContent);

          try {
            logger.info(
              `Performing ranged download for restored BAM file: ${entry.fileName}`,
            );
            await rangedDownloadBAM(
              downloadLink,
              tempBedPath,
              outputFile,
              indexFilePath,
              logger,
              metrics,
              effectiveOverwrite,
            );
            await indexBAM(outputFile, logger, effectiveOverwrite);
          } finally {
            // Clean up temp file
            if (fs.existsSync(tempBedPath)) {
              fs.unlinkSync(tempBedPath);
            }
          }
        } else {
          // Full download
          logger.info(
            `Performing full download for restored BAM file: ${entry.fileName}`,
          );
          await downloadFile(
            downloadLink,
            outputFile,
            effectiveOverwrite,
            agent,
            null, // no rl needed
            logger,
            metrics,
          );

          // Download index file if available (optional for full downloads)
          if (indexFileUrl) {
            const indexFileName = generateOutputFileName(
              `${entry.fileName}.bai`,
              regions,
              logger,
            );
            const indexFilePath = path.join(
              effectiveDestination,
              indexFileName,
            );
            logger.info(
              `Downloading optional index file: ${entry.fileName}.bai`,
            );
            try {
              await downloadFile(
                indexFileUrl,
                indexFilePath,
                effectiveOverwrite,
                agent,
                null, // no rl needed
                logger,
                metrics,
              );
            } catch (indexError) {
              logger.warn(
                `Failed to download index file ${entry.fileName}.bai: ${getErrorMessage(indexError)}`,
              );
            }
          }

          await indexBAM(outputFile, logger, effectiveOverwrite);
        }
      } else if (entry.fileName.endsWith('.vcf.gz')) {
        // Handle VCF files
        const indexFileUrl = fileDict[`${entry.fileName}.tbi`]?.downloadLink;

        // Perform ranged or full download based on restored options
        if (regions.length > 0) {
          if (!indexFileUrl) {
            logger.error(
              `Index file for VCF ${entry.fileName} not found for analysis ${entry.analysisId}. Ranged download requires .tbi index. Keeping for retry.`,
            );
            updatedData.push(entry);
            continue;
          }
          const indexFileName = generateOutputFileName(
            `${entry.fileName}.tbi`,
            regions,
            logger,
          );
          const indexFilePath = path.join(effectiveDestination, indexFileName);

          // Ensure index file is downloaded
          await ensureIndexFile(
            downloadLink,
            indexFileUrl,
            indexFilePath,
            agent,
            null, // no rl needed
            logger,
            metrics,
            effectiveOverwrite,
          );

          // Perform ranged download for VCF - use the first region for simplicity
          const range = regions[0]; // tabix uses region format directly
          logger.info(
            `Performing ranged download for restored VCF file: ${entry.fileName} with range: ${range}`,
          );
          await rangedDownloadVCF(
            downloadLink,
            range,
            outputFile,
            indexFilePath,
            logger,
            metrics,
            effectiveOverwrite,
          );
          await indexVCF(outputFile, logger, effectiveOverwrite);
        } else {
          // Full download
          logger.info(
            `Performing full download for restored VCF file: ${entry.fileName}`,
          );
          await downloadFile(
            downloadLink,
            outputFile,
            effectiveOverwrite,
            agent,
            null, // no rl needed
            logger,
            metrics,
          );

          // Download index file if available (optional for full downloads)
          if (indexFileUrl) {
            const indexFileName = generateOutputFileName(
              `${entry.fileName}.tbi`,
              regions,
              logger,
            );
            const indexFilePath = path.join(
              effectiveDestination,
              indexFileName,
            );
            logger.info(
              `Downloading optional index file: ${entry.fileName}.tbi`,
            );
            try {
              await downloadFile(
                indexFileUrl,
                indexFilePath,
                effectiveOverwrite,
                agent,
                null, // no rl needed
                logger,
                metrics,
              );
            } catch (indexError) {
              logger.warn(
                `Failed to download index file ${entry.fileName}.tbi: ${getErrorMessage(indexError)}`,
              );
            }
          }

          await indexVCF(outputFile, logger, effectiveOverwrite);
        }
      } else {
        // Handle other file types (non-BAM, non-VCF)
        logger.info(`Performing download for restored file: ${entry.fileName}`);
        await downloadFile(
          downloadLink,
          outputFile,
          effectiveOverwrite,
          agent,
          null, // no rl needed
          logger,
          metrics,
        );
      }

      logger.info(
        `Successfully resumed download for analysis ${entry.analysisId}, file ${entry.fileName}`,
      );
      // Don't add this entry to updatedData on success (it gets removed)
    } catch (error) {
      logger.error(
        `Error during resume download for ${entry.fileName}: ${getErrorMessage(error)}`,
      );
      // Keep the entry for retry
      updatedData.push(entry);
    }
  }

  // Write back only the entries that failed or aren't ready yet
  writeRestorationState(updatedData, restorationFile, logger);
  logger.info(
    `Updated restoration file ${restorationFile} - ${updatedData.length} entries remaining`,
  );
}

module.exports = {
  resumeArchivedDownloads,
};
