const fs = require('node:fs');
const { applyFilters, deduplicateByLatest } = require('./filterUtils.cjs');
const { triggerRestoreArchivedFile } = require('./archiveUtils.cjs');
const { appendBatchToAwaitingRestoration } = require('./restorationState.cjs');
const { fetchWithRetry } = require('./apiClient.cjs');
const { getErrorMessage } = require('./errorUtils.cjs');

/** @type {import('./types').Metrics} */
const metrics = {
  startTime: Date.now(),
  totalFilesDownloaded: 0,
  totalFilesSkipped: 0,
  totalFilesFailed: 0,
  totalBytesDownloaded: 0,
  downloadSpeeds: [],
};

// Global variable to store the decision for "all" option.
/** @type {boolean|undefined} */
let allDecisionForArchived;

/**
 * Prompts the user to confirm restoration of an archived file.
 * @param   {import('./types').AnalysisFile}    file    - The archived file object.
 * @param   {import('node:readline').Interface} rl      - The readline interface instance.
 * @param   {import('winston').Logger}          _logger - The logger instance (unused).
 * @returns {Promise<boolean>}                          - Resolves to true if the user confirms, otherwise false.
 */
async function confirmRestore(file, rl, _logger) {
  return new Promise((resolve) => {
    rl.question(
      `File ${file.fileName} is archived. Restore it? (y/n): `,
      (answer) => {
        resolve(answer.toLowerCase() === 'y');
      },
    );
  });
}

/**
 * Fetches analysis IDs based on sample IDs or LIMS IDs.
 * @param   {string}                           target    - The target for the Varvis API.
 * @param   {string}                           token     - The CSRF token for authentication.
 * @param   {import('./types').HttpDispatcher} agent     - The HTTP agent instance.
 * @param   {string[]}                         sampleIds - The sample IDs to filter analyses.
 * @param   {string[]}                         limsIds   - The LIMS IDs to filter analyses.
 * @param   {string[]}                         filters   - An array of custom filters to apply.
 * @param   {import('winston').Logger}         logger    - The logger instance.
 * @param   {boolean}                          latest    - If true, keep only the newest analysis per personLimsId.
 * @returns {Promise<string[]>}                          - An array of analysis IDs.
 */
async function fetchAnalysisIds(
  target,
  token,
  agent,
  sampleIds,
  limsIds,
  filters,
  logger,
  latest = false,
) {
  try {
    logger.debug('Fetching all analysis IDs');
    const response = await fetchWithRetry(
      `https://${target}.varvis.com/api/analyses`,
      {
        method: 'GET',
        headers: { 'x-csrf-token': token },
        dispatcher: agent,
      },
      3,
      logger,
    );

    const data = /** @type {{ response: import('./types').Analysis[] }} */ (
      await response.json()
    );
    let analyses = data.response;

    // Filter out analyses of type "CNV"
    let filteredAnalyses = analyses.filter(
      (analysis) => analysis.analysisType !== 'CNV',
    );

    if (sampleIds.length > 0) {
      logger.debug(`Filtering analyses by sampleIds: ${sampleIds.join(', ')}`);
      filteredAnalyses = filteredAnalyses.filter(
        (analysis) =>
          typeof analysis.sampleId === 'string' &&
          sampleIds.includes(analysis.sampleId),
      );
    }

    if (limsIds.length > 0) {
      logger.debug(`Filtering analyses by limsIds: ${limsIds.join(', ')}`);
      filteredAnalyses = filteredAnalyses.filter(
        (analysis) =>
          typeof analysis.personLimsId === 'string' &&
          limsIds.includes(analysis.personLimsId),
      );
    }

    if (filters.length > 0) {
      logger.debug(`Applying custom filters: ${filters.join(', ')}`);
      filteredAnalyses = applyFilters(filteredAnalyses, filters);
    }

    if (latest) {
      filteredAnalyses = deduplicateByLatest(filteredAnalyses, logger);
    }

    const ids = filteredAnalyses.map((analysis) => analysis.id.toString());

    if (ids.length === 0) {
      logger.info('No analysis IDs found after applying filters.');
    } else {
      logger.info(`Found ${ids.length} analysis IDs after filtering.`);
      logger.debug(`Filtered analysis IDs: ${ids.join(', ')}`);
    }

    return ids;
  } catch (error) {
    logger.error('Error fetching analysis IDs:', error);
    throw error;
  }
}

/**
 * Fetches the download links for specified file types from the Varvis API for a given analysis ID.
 * @param   {string}                                             analysisId              - The analysis ID to get download links for.
 * @param   {string[]|null}                                      filter                  - An optional array of file types to filter by.
 * @param   {string}                                             target                  - The Varvis API target.
 * @param   {string}                                             token                   - The CSRF token for authentication.
 * @param   {import('./types').HttpDispatcher}                   agent                   - The HTTP agent instance.
 * @param   {import('winston').Logger}                           logger                  - The logger instance.
 * @param   {import('./types').RestoreMode}                      [restoreArchived="ask"] - Restoration mode for archived files.
 *                                                                                       Accepts:
 *                                                                                       - "no": skip restoration,
 *                                                                                       - "ask": prompt for each file,
 *                                                                                       - "all": ask once for all files,
 *                                                                                       - "force": restore automatically,
 *                                                                                       - "none": internal list-mode value that bypasses restoration entirely.
 * @param   {import('node:readline').Interface|null}             [rl]                    - The readline interface instance for prompting.
 * @param   {string|null}                                        [restorationFile]       - Path to the restoration file.
 * @param   {Partial<import('./types').RestorationOptions>|null} [options]               - Options object for restoration context.
 * @returns {Promise<import('./types').FileDict>}                                        - An object containing the download links for the specified file types.
 */
async function getDownloadLinks(
  analysisId,
  filter,
  target,
  token,
  agent,
  logger,
  restoreArchived = 'ask',
  rl,
  restorationFile,
  options,
) {
  try {
    logger.debug(`Fetching download links for analysis ID: ${analysisId}`);
    const response = await fetchWithRetry(
      `https://${target}.varvis.com/api/analysis/${analysisId}/get-file-download-links`,
      {
        method: 'GET',
        headers: { 'x-csrf-token': token },
        dispatcher: agent,
      },
      3,
      logger,
    );
    const data =
      /** @type {{ response: { apiFileLinks: import('./types').AnalysisFile[] } }} */ (
        await response.json()
      );
    const apiFileLinks = data.response.apiFileLinks;

    /** @type {import('./types').FileDict} */
    const fileDict = {};
    /** @type {import('./types').AnalysisFile[]} */
    const filesToRestore = [];
    for (const file of apiFileLinks) {
      // If the file is a BAM and is archived, handle restoration logic.
      if (file.fileName.endsWith('.bam') && file.currentlyArchived) {
        logger.warn(
          `File ${file.fileName} for analysis ${analysisId} is archived.`,
        );
        let shouldRestore = false;
        if (restoreArchived === 'no') {
          logger.info(
            `Skipping archived file ${file.fileName} due to --restoreArchived=no`,
          );
        } else if (restoreArchived === 'force') {
          shouldRestore = true;
          logger.info(
            `Force restoring archived file ${file.fileName} due to --restoreArchived=force`,
          );
        } else if (restoreArchived === 'all') {
          if (typeof allDecisionForArchived === 'undefined' && rl) {
            logger.info(
              'Prompting for restoration decision for all archived files...',
            );
            allDecisionForArchived = await new Promise((resolve) => {
              rl.question('Restore all archived files? (y/n): ', (answer) => {
                resolve(answer.toLowerCase() === 'y');
              });
            });
            logger.info(
              `User decision for all archived files: ${allDecisionForArchived ? 'restore' : 'skip'}`,
            );
          }
          shouldRestore = allDecisionForArchived === true;
          if (!shouldRestore) {
            logger.info(
              `Skipping archived file ${file.fileName} due to --restoreArchived=all decision`,
            );
          } else {
            logger.info(
              `Restoring archived file ${file.fileName} due to --restoreArchived=all decision`,
            );
          }
        } else if (restoreArchived === 'ask' && rl) {
          logger.info(
            `Prompting for restoration of archived file ${file.fileName}...`,
          );
          shouldRestore = await confirmRestore(file, rl, logger);
          logger.info(
            `User decision for ${file.fileName}: ${shouldRestore ? 'restore' : 'skip'}`,
          );
        }

        if (shouldRestore) {
          filesToRestore.push(file);
        }
        // In all cases, skip adding this archived file to the download list.
        continue;
      }

      // NEW, ROBUST LOGIC:
      // If no filter is provided, add all files.
      // Otherwise, check if the fileName ends with any of the specified file types.
      // Always include analysisId for URL refresh tracking.
      const fileWithAnalysisId = { ...file, analysisId };
      if (!filter || filter.length === 0) {
        fileDict[file.fileName] = fileWithAnalysisId;
      } else {
        // Find if the current file's name matches any of the requested filetypes
        const matchedType = filter.find((ft) => file.fileName.endsWith(ft));
        if (matchedType) {
          logger.debug(
            `File ${file.fileName} matches filter type: ${matchedType}`,
          );
          fileDict[file.fileName] = fileWithAnalysisId;
        }
      }
    }

    if (filesToRestore.length > 0) {
      // Trigger restoration once for the analysis using the first file
      const restoreResult = await triggerRestoreArchivedFile(
        analysisId,
        filesToRestore[0],
        target,
        token,
        agent,
        logger,
        restorationFile ?? undefined,
        options ?? undefined,
        false,
      );
      if (restoreResult) {
        /** @type {import('./types').RestorationEntry[]} */
        const batchEntries = filesToRestore.map((archivedFile) => ({
          analysisId,
          fileName: archivedFile.fileName,
          restoreEstimation: restoreResult.restoreEstimation,
          options: options || {},
        }));
        await appendBatchToAwaitingRestoration(
          batchEntries,
          logger,
          restorationFile ?? undefined,
        );
      }
    }

    const totalFiles = Object.keys(fileDict).length;

    if (totalFiles === 0) {
      logger.info(
        `No files found for analysis ID: ${analysisId} after applying file type filters.`,
      );
    } else {
      logger.info(`Found ${totalFiles} files for analysis ID: ${analysisId}`);
      logger.debug(
        `Filtered analysis IDs: ${Object.keys(fileDict).join(', ')}`,
      );
    }

    // Warn if requested file types are not available
    if (filter) {
      const availableFileNames = Object.keys(fileDict);
      const missingFileTypes = filter.filter(
        (ft) => !availableFileNames.some((name) => name.endsWith(ft)),
      );
      if (missingFileTypes.length > 0) {
        logger.warn(
          `Warning: Files with the following extensions are not available for analysis ${analysisId}: ${missingFileTypes.join(', ')}`,
        );
      }
    }

    return fileDict;
  } catch (error) {
    logger.error(
      `Failed to get download links for analysis ID ${analysisId}: ${getErrorMessage(error)}`,
    );
    throw error;
  }
}

/**
 * Lists available files for the specified analysis IDs without triggering any restoration logic.
 * @param   {string}                           analysisId - The analysis ID to list files for.
 * @param   {string}                           target     - The target for the Varvis API.
 * @param   {string}                           token      - The CSRF token for authentication.
 * @param   {import('./types').HttpDispatcher} agent      - The HTTP agent instance.
 * @param   {import('winston').Logger}         logger     - The logger instance.
 * @returns {Promise<void>}
 */
async function listAvailableFiles(analysisId, target, token, agent, logger) {
  try {
    logger.info(`Listing available files for analysis ID: ${analysisId}`);
    // Pass "none" as the restoreArchived parameter to skip any restoration logic.
    const fileDict = await getDownloadLinks(
      analysisId,
      null,
      target,
      token,
      agent,
      logger,
      'none',
      null,
    );
    for (const fileName of Object.keys(fileDict)) {
      logger.info(`- ${fileName}`);
    }
  } catch (error) {
    logger.error(
      `Failed to list available files for analysis ID ${analysisId}: ${getErrorMessage(error)}`,
    );
  }
}

/**
 * Generates a summary report of the download process.
 * @param {string|undefined}         reportfile - The path to the report file.
 * @param {import('winston').Logger} logger     - The logger instance.
 */
function generateReport(reportfile, logger) {
  const totalTime = (Date.now() - metrics.startTime) / 1000; // in seconds
  const averageSpeed =
    metrics.downloadSpeeds.length > 0
      ? metrics.downloadSpeeds.reduce((a, b) => a + b, 0) /
        metrics.downloadSpeeds.length
      : 0;

  const totalFilesProcessed =
    metrics.totalFilesDownloaded + metrics.totalFilesSkipped;
  const report = `
    Download Summary Report:
    ------------------------
    Total Files Processed: ${totalFilesProcessed}
    Files Downloaded: ${metrics.totalFilesDownloaded}
    Files Skipped (already exist): ${metrics.totalFilesSkipped}
    Total Bytes Downloaded: ${metrics.totalBytesDownloaded}
    Average Download Speed: ${averageSpeed.toFixed(2)} bytes/sec
    Total Time Taken: ${totalTime.toFixed(2)} seconds
  `;

  logger.info(report);

  if (reportfile) {
    fs.writeFileSync(reportfile, report);
    logger.info(`Report written to ${reportfile}`);
  }
}

/**
 * Refreshes download URLs for a specific analysis ID.
 * This is a lightweight version of getDownloadLinks that only fetches fresh URLs
 * without the archive restoration logic. Used when existing URLs are expiring.
 *
 * @param   {string}                              analysisId - The analysis ID to fetch URLs for.
 * @param   {string}                              target     - The target for the Varvis API.
 * @param   {string}                              token      - The CSRF token for authentication.
 * @param   {import('./types').HttpDispatcher}    agent      - The HTTP agent instance.
 * @param   {import('winston').Logger}            logger     - The logger instance.
 * @returns {Promise<import('./types').FileDict>}            - An object mapping filenames to their download info.
 */
async function refreshDownloadUrls(analysisId, target, token, agent, logger) {
  try {
    logger.debug(`Refreshing download URLs for analysis ID: ${analysisId}`);
    const response = await fetchWithRetry(
      `https://${target}.varvis.com/api/analysis/${analysisId}/get-file-download-links`,
      {
        method: 'GET',
        headers: { 'x-csrf-token': token },
        dispatcher: agent,
      },
      3,
      logger,
    );
    const data =
      /** @type {{ response: { apiFileLinks: import('./types').AnalysisFile[] } }} */ (
        await response.json()
      );
    const apiFileLinks = data.response.apiFileLinks;

    /** @type {import('./types').FileDict} */
    const fileDict = {};
    for (const file of apiFileLinks) {
      // Skip archived files - they don't have valid download URLs
      if (file.currentlyArchived) {
        continue;
      }
      fileDict[file.fileName] = {
        fileName: file.fileName,
        downloadLink: file.downloadLink,
        size: file.size,
        analysisId,
      };
    }

    logger.info(
      `Refreshed ${Object.keys(fileDict).length} download URLs for analysis ${analysisId}`,
    );
    return fileDict;
  } catch (error) {
    logger.error(
      `Failed to refresh download URLs for analysis ${analysisId}: ${getErrorMessage(error)}`,
    );
    throw error;
  }
}

module.exports = {
  fetchAnalysisIds,
  getDownloadLinks,
  refreshDownloadUrls,
  listAvailableFiles,
  generateReport,
  metrics,
};
