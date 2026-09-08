const { appendToAwaitingRestoration } = require('./restorationState.cjs');
const { getErrorMessage } = require('./errorUtils.cjs');

/**
 * Triggers restoration for an archived analysis file using the internal restore endpoint.
 * @param   {string}                                        analysisId                                    - The analysis ID of the archived file.
 * @param   {import('./types').AnalysisFile}                file                                          - The file object from the API response (should include fileName).
 * @param   {string}                                        target                                        - The target for the Varvis API.
 * @param   {string}                                        token                                         - The CSRF token for authentication.
 * @param   {import('./types').HttpDispatcher}              agent                                         - The HTTP agent instance.
 * @param   {import('winston').Logger}                      logger                                        - The logger instance.
 * @param   {string}                                        [restorationFile="awaiting-restoration.json"] - Optional path/name for the awaiting restoration JSON file.
 * @param   {Partial<import('./types').RestorationOptions>} [options={}]                                  - Options object for restoration context.
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
      `Error triggering restoration for analysis ${analysisId}: ${getErrorMessage(error)}`,
    );
  }
}

module.exports = {
  triggerRestoreArchivedFile,
  appendToAwaitingRestoration,
};
