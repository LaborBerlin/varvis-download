const fs = require("fs");
const path = require("path");

/**
 * Triggers restoration for an archived analysis file using the internal restore endpoint.
 * @param {string} analysisId - The analysis ID of the archived file.
 * @param {Object} file - The file object from the API response (should include fileName).
 * @param {string} target - The target for the Varvis API.
 * @param {string} token - The CSRF token for authentication.
 * @param {Object} agent - The HTTP agent instance.
 * @param {Object} logger - The logger instance.
 * @param {string} [restorationFile="awaiting-restoration.json"] - Optional path/name for the awaiting restoration JSON file.
 * @returns {Promise<void>}
 */
async function triggerRestoreArchivedFile(
  analysisId,
  file,
  target,
  token,
  agent,
  logger,
  restorationFile = "awaiting-restoration.json",
) {
  try {
    logger.info(
      `Triggering restoration for archived file ${file.fileName} (analysis ID: ${analysisId})`,
    );
    const postData = new URLSearchParams();
    postData.append("analysisIds", analysisId);
    postData.append("disableArchive", "false");

    // Use apiClient to avoid circular dependency.
    const { fetchWithRetry } = require("./apiClient");

    const response = await fetchWithRetry(
      `https://${target}.varvis.com/archive/analysis/restore`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "x-csrf-token": token,
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
          options: {}, // Additional options can be added here if needed
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
  restorationFile = "awaiting-restoration.json",
) {
  let data = [];
  if (fs.existsSync(restorationFile)) {
    try {
      data = JSON.parse(fs.readFileSync(restorationFile, "utf-8"));
    } catch (error) {
      logger.error(
        "Failed to parse awaiting-restoration file. Starting fresh.",
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
 * For each entry, if the current time is past the restoreEstimation, it attempts to download the file.
 * On success, the entry is removed; otherwise, it is kept for later resumption.
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
    data = JSON.parse(fs.readFileSync(restorationFile, "utf-8"));
  } catch (error) {
    logger.error(
      `Error reading restoration file ${restorationFile}: ${error.message}`,
    );
    return;
  }
  if (!Array.isArray(data) || data.length === 0) {
    logger.info("Restoration file is empty. Nothing to resume.");
    return;
  }
  // Lazy-require necessary functions
  const { getDownloadLinks } = require("./fetchUtils");
  const {
    ensureIndexFile,
    generateOutputFileName,
    indexBAM,
  } = require("./rangedUtils");
  const { downloadFile } = require("./fileUtils");
  const metrics = require("./fetchUtils").metrics;

  let updatedData = [];
  const now = new Date();
  for (const entry of data) {
    if (entry.restoreEstimation) {
      const restoreTime = new Date(entry.restoreEstimation);
      if (now >= restoreTime) {
        logger.info(
          `Resuming download for analysis ${entry.analysisId}, file ${entry.fileName}.`,
        );
        let fileDict;
        try {
          // Get current download links; pass "none" so restoration isn't re-triggered
          fileDict = await getDownloadLinks(
            entry.analysisId,
            null, // no filter: get all files
            target,
            token,
            agent,
            logger,
            "none",
            null,
          );
        } catch (e) {
          logger.error(
            `Failed to get download links for analysis ${entry.analysisId}: ${e.message}`,
          );
          updatedData.push(entry);
          continue;
        }
        if (!(entry.fileName in fileDict)) {
          logger.warn(
            `File ${entry.fileName} not found for analysis ${entry.analysisId}. Skipping.`,
          );
          updatedData.push(entry);
          continue;
        }
        const file = fileDict[entry.fileName];
        const downloadLink = file.downloadLink;
        const indexFileUrl = fileDict[`${entry.fileName}.bai`]?.downloadLink;
        if (!indexFileUrl) {
          logger.error(
            `Index file for ${entry.fileName} not found for analysis ${entry.analysisId}. Skipping.`,
          );
          updatedData.push(entry);
          continue;
        }
        const indexFilePath = path.join(destination, `${entry.fileName}.bai`);
        try {
          await ensureIndexFile(
            downloadLink,
            indexFileUrl,
            indexFilePath,
            agent,
            null, // no rl needed
            logger,
            metrics,
            overwrite,
          );
        } catch (e) {
          logger.error(
            `Failed to ensure index file for ${entry.fileName}: ${e.message}`,
          );
          updatedData.push(entry);
          continue;
        }
        const outputFile = path.join(
          destination,
          generateOutputFileName(entry.fileName, "", logger),
        );
        try {
          logger.info(
            `Performing full download for archived file ${entry.fileName}`,
          );
          await downloadFile(
            downloadLink,
            outputFile,
            overwrite,
            agent,
            null, // no rl needed
            logger,
            metrics,
          );
          await indexBAM(outputFile, logger, overwrite);
          logger.info(
            `Successfully resumed download for analysis ${entry.analysisId}, file ${entry.fileName}`,
          );
          // Do not re-add this entry on success.
        } catch (error) {
          logger.error(
            `Error during download for ${entry.fileName}: ${error.message}`,
          );
          updatedData.push(entry);
        }
      } else {
        // Restoration time hasn't passed; keep the entry.
        updatedData.push(entry);
      }
    } else {
      // No restoreEstimation present; keep the entry.
      updatedData.push(entry);
    }
  }
  fs.writeFileSync(restorationFile, JSON.stringify(updatedData, null, 2));
  logger.info(`Updated restoration file ${restorationFile}`);
}

module.exports = {
  triggerRestoreArchivedFile,
  appendToAwaitingRestoration,
  resumeArchivedDownloads,
};
