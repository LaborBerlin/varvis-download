const fs = require('node:fs');

/**
 * Deep equality comparison for objects that is order-independent.
 * @param   {object}  obj1 - First object to compare.
 * @param   {object}  obj2 - Second object to compare.
 * @returns {boolean}      - True if objects are deeply equal.
 */
function deepEqual(obj1, obj2) {
  if (obj1 === obj2) return true;
  if (typeof obj1 !== typeof obj2) return false;
  if (obj1 === null || obj2 === null) return obj1 === obj2;
  if (typeof obj1 !== 'object') return obj1 === obj2;

  const keys1 = Object.keys(obj1).sort();
  const keys2 = Object.keys(obj2).sort();

  if (keys1.length !== keys2.length) return false;
  if (keys1.join(',') !== keys2.join(',')) return false;

  for (const key of keys1) {
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }

  return true;
}

/**
 * Reads the restoration state from a JSON file.
 * @param   {string}     restorationFile - The path to the awaiting-restoration JSON file.
 * @param   {object}     logger          - The logger instance.
 * @returns {Array|null}                 - Array of restoration entries, or null if file doesn't exist or is empty.
 */
function readRestorationState(restorationFile, logger) {
  if (!fs.existsSync(restorationFile)) {
    logger.debug(`Restoration file not found: ${restorationFile}`);
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(restorationFile, 'utf-8'));
    if (!Array.isArray(data)) {
      logger.warn(
        `Restoration file ${restorationFile} does not contain a valid array`,
      );
      return null;
    }
    if (data.length === 0) {
      logger.debug(`Restoration file ${restorationFile} is empty`);
      return null;
    }
    return data;
  } catch (error) {
    logger.error(
      `Failed to parse restoration file ${restorationFile}: ${error.message}`,
    );
    return null;
  }
}

/**
 * Writes the restoration state to a JSON file.
 * @param {Array}  data            - Array of restoration entries to write.
 * @param {string} restorationFile - The path to the awaiting-restoration JSON file.
 * @param {object} logger          - The logger instance.
 */
function writeRestorationState(data, restorationFile, logger) {
  fs.writeFileSync(restorationFile, JSON.stringify(data, null, 2));
  logger.debug(`Updated restoration file: ${restorationFile}`);
}

/**
 * Appends or updates restoration information in an awaiting-restoration JSON file.
 * The entry is identified by matching analysisId, fileName, and options.
 * @param   {object}        restorationInfo                               - An object containing restoration details (analysisId, fileName, restoreEstimation, options).
 * @param   {object}        logger                                        - The logger instance.
 * @param   {string}        [restorationFile="awaiting-restoration.json"] - Optional path/name for the awaiting restoration JSON file.
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
      const parsed = JSON.parse(fs.readFileSync(restorationFile, 'utf-8'));
      // Validate that parsed data is an array before using array methods
      if (Array.isArray(parsed)) {
        data = parsed;
      } else {
        logger.warn(
          'Restoration file does not contain a valid array. Starting fresh.',
        );
      }
    } catch {
      logger.error(
        'Failed to parse awaiting-restoration file. Starting fresh.',
      );
    }
  }
  // Check if an entry with the same analysisId, fileName, and options exists.
  // Use deep equality for options comparison to handle different property orders.
  const index = data.findIndex(
    (entry) =>
      entry.analysisId === restorationInfo.analysisId &&
      entry.fileName === restorationInfo.fileName &&
      deepEqual(entry.options || {}, restorationInfo.options || {}),
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
 * Removes an entry from the restoration state.
 * @param   {string}  analysisId      - The analysis ID to remove.
 * @param   {string}  fileName        - The file name to remove.
 * @param   {string}  restorationFile - The path to the awaiting-restoration JSON file.
 * @param   {object}  logger          - The logger instance.
 * @returns {boolean}                 - True if entry was removed, false if not found.
 */
function removeRestorationEntry(analysisId, fileName, restorationFile, logger) {
  const data = readRestorationState(restorationFile, logger);
  if (!data) {
    return false;
  }

  const index = data.findIndex(
    (entry) => entry.analysisId === analysisId && entry.fileName === fileName,
  );

  if (index === -1) {
    return false;
  }

  data.splice(index, 1);
  writeRestorationState(data, restorationFile, logger);
  logger.info(
    `Removed restoration entry for ${fileName} (analysis ${analysisId})`,
  );
  return true;
}

/**
 * Gets entries that are ready for download (restoration time has passed).
 * @param   {string} restorationFile - The path to the awaiting-restoration JSON file.
 * @param   {object} logger          - The logger instance.
 * @returns {object}                 - Object with ready and pending arrays.
 */
function getReadyEntries(restorationFile, logger) {
  const data = readRestorationState(restorationFile, logger);
  if (!data) {
    return { ready: [], pending: [] };
  }

  const now = new Date();
  const ready = [];
  const pending = [];

  for (const entry of data) {
    if (!entry.restoreEstimation || new Date(entry.restoreEstimation) <= now) {
      ready.push(entry);
    } else {
      pending.push(entry);
    }
  }

  return { ready, pending };
}

module.exports = {
  readRestorationState,
  writeRestorationState,
  appendToAwaitingRestoration,
  removeRestorationEntry,
  getReadyEntries,
};
