const { appendToAwaitingRestoration } = require('./restorationState.cjs');
const { getErrorMessage } = require('./errorUtils.cjs');

/**
 * Triggers restoration for an archived analysis file using the internal restore endpoint.
 * @param   {string}                                           analysisId                                    - The analysis ID of the archived file.
 * @param   {import('./types').AnalysisFile}                   file                                          - The file object from the API response (should include fileName).
 * @param   {string}                                           target                                        - The target for the Varvis API.
 * @param   {string}                                           token                                         - The CSRF token for authentication.
 * @param   {import('./types').HttpDispatcher}                 agent                                         - The HTTP agent instance.
 * @param   {import('winston').Logger}                         logger                                        - The logger instance.
 * @param   {string}                                           [restorationFile="awaiting-restoration.json"] - Optional path/name for the awaiting restoration JSON file.
 * @param   {Partial<import('./types').RestorationOptions>}    [options={}]                                  - Options object for restoration context.
 * @param   {boolean}                                          [persistState=true]                           - Whether to write entry immediately to state file.
 * @returns {Promise<import('./types').RestorationEntry|null>}                                               - The restoration entry if successfully triggered, otherwise null.
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
  persistState = true,
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
    const result =
      /** @type {{ success?: boolean; response?: Array<{ restoreEstimation?: string | null }>; errorMessageId?: string }} */ (
        await response.json()
      );
    if (result.success) {
      const restoreEstimation =
        result.response && result.response[0]
          ? result.response[0].restoreEstimation
          : null;
      logger.info(
        `Restoration initiated for analysis ${analysisId}. Expected availability: ${restoreEstimation}`,
      );
      /** @type {import('./types').RestorationEntry} */
      const entry = {
        analysisId,
        fileName: file.fileName,
        restoreEstimation,
        options,
      };
      if (persistState) {
        await appendToAwaitingRestoration(entry, logger, restorationFile);
      }
      return entry;
    }
    logger.error(
      `Failed to initiate restoration for analysis ${analysisId}: ${result.errorMessageId}`,
    );
    return null;
  } catch (error) {
    logger.error(
      `Error triggering restoration for analysis ${analysisId}: ${getErrorMessage(error)}`,
    );
    return null;
  }
}

module.exports = {
  triggerRestoreArchivedFile,
  appendToAwaitingRestoration,
};
