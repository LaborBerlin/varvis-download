const { downloadFile } = require('../fileUtils.cjs');
const { getErrorMessage } = require('../errorUtils.cjs');

/**
 * @typedef {object} DownloadTarget
 * @property {string} path - Output path.
 * @property {string} url  - Download URL.
 */

/**
 * @typedef {object} OptionalIndexTarget
 * @property {string} label - Human-readable index label for logs.
 * @property {string} path  - Output path.
 * @property {string} url   - Download URL.
 */

/**
 * @typedef {object} FullDownloadOptions
 * @property {OptionalIndexTarget|null} index     - Optional index target.
 * @property {boolean}                  overwrite - Whether to overwrite existing files.
 * @property {DownloadTarget}           primary   - Primary file target.
 */

/**
 * @typedef {object} DownloadDeps
 * @property {import('../types').HttpDispatcher} agent   - HTTP dispatcher.
 * @property {import('winston').Logger}          logger  - Logger instance.
 * @property {import('../types').Metrics}        metrics - Download metrics.
 * @property {import('node:readline').Interface|null} rl - Prompt interface.
 */

/**
 * Downloads a primary file and then optionally downloads its index file.
 *
 * @param   {FullDownloadOptions} options - Download options.
 * @param   {DownloadDeps}        deps    - Injected dependencies.
 * @returns {Promise<void>}
 */
async function fullDownloadWithOptionalIndex(
  { primary, index, overwrite },
  deps,
) {
  const { agent, logger, metrics, rl } = deps;

  await downloadFile(
    primary.url,
    primary.path,
    overwrite,
    agent,
    rl,
    logger,
    metrics,
  );

  if (!index) {
    return;
  }

  logger.info(`Downloading optional index file: ${index.label}`);
  try {
    await downloadFile(
      index.url,
      index.path,
      overwrite,
      agent,
      rl,
      logger,
      metrics,
    );
  } catch (error) {
    logger.warn(
      `Failed to download index file ${index.label}: ${getErrorMessage(error)}`,
    );
  }
}

module.exports = { fullDownloadWithOptionalIndex };
