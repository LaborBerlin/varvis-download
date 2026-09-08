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
 * Downloads an optional index file first, then downloads the primary file.
 * Downloading the index first prevents presigned S3 URL expiration on the index
 * during long multi-gigabyte primary file downloads.
 *
 * @param   {FullDownloadOptions}                   options - Download options.
 * @param   {DownloadDeps}                          deps    - Injected dependencies.
 * @returns {Promise<{ indexDownloaded: boolean }>}         Download completion status.
 */
async function fullDownloadWithOptionalIndex(
  { primary, index, overwrite },
  deps,
) {
  const { agent, logger, metrics, rl } = deps;
  let indexDownloaded = false;

  if (index) {
    logger.info(`Downloading index file: ${index.label}`);
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
      indexDownloaded = true;
    } catch (error) {
      logger.warn(
        `Failed to download index file ${index.label}: ${getErrorMessage(error)}. Attempting primary download anyway.`,
      );
    }
  }

  await downloadFile(
    primary.url,
    primary.path,
    overwrite,
    agent,
    rl,
    logger,
    metrics,
  );

  return { indexDownloaded };
}

module.exports = { fullDownloadWithOptionalIndex };
