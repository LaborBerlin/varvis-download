const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getDownloadLinks, metrics } = require('../fetchUtils.cjs');
const {
  readRestorationState,
  writeRestorationState,
} = require('../restorationState.cjs');
const { generateOutputFileName } = require('../rangedUtils.cjs');
const { downloadFile } = require('../fileUtils.cjs');
const { getErrorMessage } = require('../errorUtils.cjs');
const { regionToBedLine } = require('../io/regionParsing.cjs');
const { handleBamFile } = require('../download/bamHandler.cjs');
const { handleVcfFile } = require('../download/vcfHandler.cjs');

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
      const includeUnmapped = restoredOptions.unmapped === true;

      // Generate output filename using restored context. The unmapped suffix
      // is scoped to the BAM unmapped-only branch below; other file types keep
      // their canonical name even when the global --unmapped flag was persisted.
      const outputFile = path.join(
        effectiveDestination,
        generateOutputFileName(entry.fileName, regions, logger),
      );

      const isBam = entry.fileName.endsWith('.bam');
      const isVcf = entry.fileName.endsWith('.vcf.gz');

      // Preserve resume's own index-required preflight: a ranged/unmapped BAM
      // or a ranged VCF must requeue immediately when the index link is
      // missing, rather than reaching the handler's own missing-index branch.
      if (isBam && (regions.length > 0 || includeUnmapped)) {
        const indexFileUrl = fileDict[`${entry.fileName}.bai`]?.downloadLink;
        if (!indexFileUrl) {
          logger.error(
            `Index file for BAM ${entry.fileName} not found for analysis ${entry.analysisId}. Ranged/unmapped download requires .bai index. Keeping for retry.`,
          );
          updatedData.push(entry);
          continue;
        }
      }
      if (isVcf && regions.length > 0) {
        const indexFileUrl = fileDict[`${entry.fileName}.tbi`]?.downloadLink;
        if (!indexFileUrl) {
          logger.error(
            `Index file for VCF ${entry.fileName} not found for analysis ${entry.analysisId}. Ranged download requires .tbi index. Keeping for retry.`,
          );
          updatedData.push(entry);
          continue;
        }
      }

      const deps = {
        agent,
        authService: { token },
        logger,
        metrics,
        rl: null,
      };

      let downloadSucceeded = true;

      if (isBam) {
        let tempBedPath;
        if (regions.length > 0) {
          tempBedPath = path.join(
            os.tmpdir(),
            `restore-regions-${entry.analysisId}-${entry.fileName}.bed`,
          );
          fs.writeFileSync(
            tempBedPath,
            regions.map(regionToBedLine).join('\n'),
          );
        }
        try {
          const result = await handleBamFile(
            {
              fileDict,
              fileName: entry.fileName,
              finalConfig: {
                destination: effectiveDestination,
                overwrite: effectiveOverwrite,
                unmapped: includeUnmapped,
              },
              regions,
              target,
              tempBedPath,
            },
            deps,
          );
          downloadSucceeded = result.ok;
        } finally {
          if (tempBedPath && fs.existsSync(tempBedPath)) {
            fs.unlinkSync(tempBedPath);
          }
        }
      } else if (isVcf) {
        // Force unmapped:false: a persisted global --unmapped flag must not
        // make the VCF handler skip the download.
        const result = await handleVcfFile(
          {
            fileDict,
            fileName: entry.fileName,
            finalConfig: {
              destination: effectiveDestination,
              overwrite: effectiveOverwrite,
              unmapped: false,
            },
            regions,
            target,
          },
          deps,
        );
        downloadSucceeded = result.ok;
      } else {
        // Handle other file types (non-BAM, non-VCF). Throws on failure,
        // which the outer per-entry catch below requeues.
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

      if (downloadSucceeded) {
        logger.info(
          `Successfully resumed download for analysis ${entry.analysisId}, file ${entry.fileName}`,
        );
      } else {
        updatedData.push(entry);
      }
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
