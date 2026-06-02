const { refreshDownloadUrls } = require('../fetchUtils.cjs');
const {
  formatRemainingTime,
  getUrlRemainingTime,
  isUrlExpiringSoon,
} = require('../urlUtils.cjs');

/**
 * Returns a valid download URL for a file, refreshing it when near expiry.
 *
 * @param   {import('../types').FileDict}       fileDict - File dictionary.
 * @param   {string}                            fileName - File name to resolve.
 * @param   {string}                            target   - Varvis target.
 * @param   {string}                            token    - CSRF token.
 * @param   {import('../types').HttpDispatcher} agent    - HTTP dispatcher.
 * @param   {import('winston').Logger}          logger   - Logger instance.
 * @returns {Promise<string>}                            - Valid download URL.
 */
async function getValidDownloadUrl(
  fileDict,
  fileName,
  target,
  token,
  agent,
  logger,
) {
  const file = fileDict[fileName];
  if (!file || !file.downloadLink) {
    throw new Error(`No download link found for file: ${fileName}`);
  }

  const downloadLink = file.downloadLink;

  if (!isUrlExpiringSoon(downloadLink)) {
    return downloadLink;
  }

  const remainingTime = getUrlRemainingTime(downloadLink);
  const formattedTime =
    remainingTime !== null ? formatRemainingTime(remainingTime) : 'unknown';
  logger.warn(
    `Download URL for ${fileName} is expiring soon (${formattedTime} remaining). Refreshing...`,
  );

  const analysisId = file.analysisId;
  if (!analysisId) {
    logger.warn(
      `No analysisId found for ${fileName}, using potentially expired URL`,
    );
    return downloadLink;
  }

  const freshFileDict = await refreshDownloadUrls(
    analysisId,
    target,
    token,
    agent,
    logger,
  );

  for (const [fname, freshFile] of Object.entries(freshFileDict)) {
    if (fileDict[fname]) {
      fileDict[fname].downloadLink = freshFile.downloadLink;
    }
  }

  const refreshedFile = freshFileDict[fileName];
  if (refreshedFile?.downloadLink) {
    logger.info(`URL refreshed successfully for ${fileName}`);
    return refreshedFile.downloadLink;
  }

  logger.warn(
    `Could not find refreshed URL for ${fileName}, using original URL`,
  );
  return downloadLink;
}

module.exports = { getValidDownloadUrl };
