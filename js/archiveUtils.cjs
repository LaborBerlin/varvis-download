const fs = require('fs');
const path = require('path');

/**
 * Triggers restoration for an archived analysis file using the internal restore endpoint.
 * @param {string} analysisId - The analysis ID of the archived file.
 * @param {Object} file - The file object from the API response (should include fileName).
 * @param {string} target - The target for the Varvis API.
 * @param {string} token - The CSRF token for authentication.
 * @param {Object} agent - The HTTP agent instance.
 * @param {Object} logger - The logger instance.
 * @param {string} [restorationFile="awaiting-restoration.json"] - Optional path/name for the awaiting restoration JSON file.
 * @param {Object} [options={}] - Options object for restoration context.
 * @returns {Promise<void>}
 */
async function triggerRestoreArchivedFile(
  analysisId,
  file,
  target,
  token,
  agent,
  logger,
  restorationFile = 'awaiting-restoration.json',
  options = {},
) {
  try {
    logger.info(
      `Triggering restoration for archived file ${file.fileName} (analysis ID: ${analysisId})`,
    );
    const postData = new URLSearchParams();
    postData.append('analysisIds', analysisId);
    postData.append('disableArchive', 'false');

    // Use apiClient to avoid circular dependency.
    const { fetchWithRetry } = require('./apiClient.cjs');

    const response = await fetchWithRetry(
      `https://${target}.varvis.com/archive/analysis/restore`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-csrf-token': token,
        },
        body: postData,
        dispatcher: agent,
      },
      3,
      logger,
    );
    const result = await response.json();
    if (result.success) {
      const restoreEstimation =
        result.response && result.response[0]
          ? result.response[0].restoreEstimation
          : null;
      logger.info(
        `Restoration initiated for analysis ${analysisId}. Expected availability: ${restoreEstimation}`,
      );
      await appendToAwaitingRestoration(
        {
          analysisId,
          fileName: file.fileName,
          restoreEstimation,
          options,
        },
        logger,
        restorationFile,
      );
    } else {
      logger.error(
        `Failed to initiate restoration for analysis ${analysisId}: ${result.errorMessageId}`,
      );
    }
  } catch (error) {
    logger.error(
      `Error triggering restoration for analysis ${analysisId}: ${error.message}`,
    );
  }
}

/**
 * Appends or updates restoration information in an awaiting-restoration JSON file.
 * The entry is identified by matching analysisId, fileName, and options.
 * @param {Object} restorationInfo - An object containing restoration details (analysisId, fileName, restoreEstimation, options).
 * @param {Object} logger - The logger instance.
 * @param {string} [restorationFile="awaiting-restoration.json"] - Optional path/name for the awaiting restoration JSON file.
 * @returns {Promise<void>}
 */
async function appendToAwaitingRestoration(
  restorationInfo,
  logger,
  restorationFile = 'awaiting-restoration.json',
) {
  let data = [];
  if (fs.existsSync(restorationFile)) {
    try {
      data = JSON.parse(fs.readFileSync(restorationFile, 'utf-8'));
    } catch {
      logger.error(
        'Failed to parse awaiting-restoration file. Starting fresh.',
      );
    }
  }
  // Check if an entry with the same analysisId, fileName, and options exists.
  const index = data.findIndex(
    (entry) =>
      entry.analysisId === restorationInfo.analysisId &&
      entry.fileName === restorationInfo.fileName &&
      JSON.stringify(entry.options || {}) ===
        JSON.stringify(restorationInfo.options || {}),
  );
  if (index !== -1) {
    // Overwrite existing entry.
    data[index] = restorationInfo;
    logger.info(
      `Updated existing restoration entry for analysis ${restorationInfo.analysisId}, file ${restorationInfo.fileName}.`,
    );
  } else {
    // Append new entry.
    data.push(restorationInfo);
    logger.info(
      `Appended new restoration entry for analysis ${restorationInfo.analysisId}, file ${restorationInfo.fileName}.`,
    );
  }
  fs.writeFileSync(restorationFile, JSON.stringify(data, null, 2));
  logger.info(`Restoration info written to ${restorationFile}`);
}

/**
 * Resumes downloads for archived files as specified in the awaiting-restoration JSON file.
 * For each entry, if the current time is past the restoreEstimation, it attempts to download the file
 * using the restored context options. On success, the entry is removed; otherwise, it is kept for later resumption.
 * @param {string} restorationFile - The path/name of the awaiting-restoration JSON file.
 * @param {string} destination - The destination folder for downloads.
 * @param {string} target - The Varvis API target.
 * @param {string} token - The CSRF token for authentication.
 * @param {Object} agent - The HTTP agent instance.
 * @param {Object} logger - The logger instance.
 * @param {boolean} overwrite - Flag indicating whether to overwrite existing files.
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
  if (!fs.existsSync(restorationFile)) {
    logger.info(
      `No restoration file found at ${restorationFile}. Nothing to resume.`,
    );
    return;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(restorationFile, 'utf-8'));
  } catch (error) {
    logger.error(
      `Error reading restoration file ${restorationFile}: ${error.message}`,
    );
    return;
  }
  if (!Array.isArray(data) || data.length === 0) {
    logger.info('Restoration file is empty. Nothing to resume.');
    return;
  }

  // Lazy-require necessary functions
  const { getDownloadLinks } = require('./fetchUtils.cjs');
  const {
    ensureIndexFile,
    generateOutputFileName,
    indexBAM,
    rangedDownloadBAM,
  } = require('./rangedUtils.cjs');
  const { downloadFile } = require('./fileUtils.cjs');
  const metrics = require('./fetchUtils.cjs').metrics;

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

      // Fetch fresh links with "no" restore option to prevent re-triggering restoration
      const fileDict = await getDownloadLinks(
        entry.analysisId,
        null, // no filter: get all files
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

      // Handle genomic ranges from restored options
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
            `Error reading BED file ${restoredOptions.bed}: ${bedError.message}. Proceeding with full download.`,
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
        if (!indexFileUrl) {
          logger.error(
            `Index file for ${entry.fileName} not found for analysis ${entry.analysisId}. Keeping for retry.`,
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

        // Perform ranged or full download based on restored options
        if (regions.length > 0) {
          // Create temporary BED file for ranged download
          const os = require('os');
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
          await indexBAM(outputFile, logger, effectiveOverwrite);
        }
      } else {
        // Handle other file types (non-BAM)
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
        `Error during resume download for ${entry.fileName}: ${error.message}`,
      );
      // Keep the entry for retry
      updatedData.push(entry);
    }
  }

  // Write back only the entries that failed or aren't ready yet
  fs.writeFileSync(restorationFile, JSON.stringify(updatedData, null, 2));
  logger.info(
    `Updated restoration file ${restorationFile} - ${updatedData.length} entries remaining`,
  );
}

module.exports = {
  triggerRestoreArchivedFile,
  appendToAwaitingRestoration,
  resumeArchivedDownloads,
};
