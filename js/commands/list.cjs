const { fetchAnalysisIds, listAvailableFiles } = require('../fetchUtils.cjs');

/**
 * Runs the --list command.
 *
 * @param   {{finalConfig: import('../types').FinalConfig}} args - Command args.
 * @param   {import('../types').CommandDeps}                deps - Shared command dependencies.
 * @returns {Promise<void>}
 */
async function runListCommand({ finalConfig }, deps) {
  const { agent, authService, logger } = deps;
  const { analysisIds, filters, latest, limsIds, sampleIds, target } =
    finalConfig;

  const ids =
    analysisIds.length > 0
      ? analysisIds
      : await fetchAnalysisIds(
          target,
          authService.token,
          agent,
          sampleIds,
          limsIds,
          filters,
          logger,
          latest,
        );

  logger.info(`Fetched analysis IDs: ${ids}`);
  for (const analysisId of ids) {
    await listAvailableFiles(
      analysisId,
      target,
      authService.token,
      agent,
      logger,
    );
  }
  logger.info('Listing complete.');
}

module.exports = { runListCommand };
