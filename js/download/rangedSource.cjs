const fs = require('node:fs');

const { getErrorMessage } = require('../errorUtils.cjs');
const {
  buildSparseMirror,
  removeSparseMirror,
} = require('../range/sparseMirror.cjs');

/**
 * @typedef {object} RangedSource
 * @property {string} location  - URL or local sparse path handed to samtools/tabix.
 * @property {string} indexPath - Index path matching `location`.
 */

/**
 * @typedef {object} RangedSourceOptions
 * @property {import('../types').RangeStrategy|undefined} strategy - Configured strategy (default planned).
 * @property {string}      url             - Signed object URL.
 * @property {string}      indexPath       - Downloaded local index.
 * @property {'bam'|'vcf'} format          - Object format.
 * @property {string[]}    regions         - Region strings.
 * @property {boolean}     includeUnmapped - Unplaced reads requested.
 * @property {string[]}    outputs         - Output files the run will produce.
 * @property {boolean}     overwrite       - Whether existing outputs are replaced.
 * @property {string}      fileName        - Remote file name, for logs.
 */

/**
 * Formats a byte count for log lines.
 * @param   {number} bytes - Byte count.
 * @returns {string}       - Human-readable size.
 */
function formatBytes(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} kB`;
}

/**
 * Runs a ranged extraction against the cheapest correct source. With the
 * planned strategy only index-selected BGZF blocks are fetched into a sparse
 * local copy; any failure retries once against the remote URL.
 * @param   {RangedSourceOptions}                                              options - Source options.
 * @param   {Pick<import('../types').CommandDeps, 'agent'|'logger'|'metrics'>} deps    - Dependencies.
 * @param   {(source: RangedSource) => Promise<void>}                          run     - Extraction to perform.
 * @returns {Promise<void>}
 */
async function withRangedSource(options, deps, run) {
  const { logger, metrics, agent } = deps;
  const remote = { location: options.url, indexPath: options.indexPath };
  const outputsExist =
    !options.overwrite &&
    options.outputs.length > 0 &&
    options.outputs.every((file) => fs.existsSync(file));
  if (
    options.strategy === 'stream' ||
    outputsExist ||
    (options.regions.length === 0 && !options.includeUnmapped)
  ) {
    await run(remote);
    return;
  }

  /** @type {import('../range/sparseMirror.cjs').SparseMirror|undefined} */
  let mirror;
  try {
    mirror = await buildSparseMirror({
      url: options.url,
      indexPath: options.indexPath,
      format: options.format,
      regions: options.regions,
      includeUnmapped: options.includeUnmapped,
      dispatcher: agent,
      logger,
      fileName: options.fileName,
    });
    const { bytes, requests, fileSize } = mirror.stats;
    metrics.totalBytesDownloaded += bytes;
    logger.info(
      `Planned ranged read for ${options.fileName}: fetched ${formatBytes(bytes)} in ${requests} requests (${((100 * bytes) / fileSize).toFixed(1)}% of ${formatBytes(fileSize)})`,
    );
    await run({ location: mirror.dataPath, indexPath: mirror.indexPath });
  } catch (error) {
    logger.warn(
      `Planned ranged read failed for ${options.fileName} (${getErrorMessage(error)}); retrying with streamed remote access.`,
    );
    await run(remote);
  } finally {
    if (mirror) await removeSparseMirror(mirror);
  }
}

module.exports = { withRangedSource };
