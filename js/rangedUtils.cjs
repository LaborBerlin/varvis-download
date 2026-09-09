const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { downloadFile } = require('./fileUtils.cjs');
const { createBoundedRangeProxy } = require('./net/boundedRangeProxy.cjs');
const {
  spawnPromise,
  compareVersions,
  checkToolAvailability,
} = require('./toolChecks.cjs');
const { getErrorMessage } = require('./errorUtils.cjs');

/**
 * @typedef {object} ProxyOptions
 * @property {boolean} [enabled] - Whether bounded range reverse proxy is enabled.
 * @property {number}  [chunkSize] - Maximum chunk size in bytes for bounded range requests.
 */

/**
 * Performs a ranged download for a BAM file using samtools.
 * @param   {string}                    url                     - The URL of the BAM file.
 * @param   {string}                    bedFile                 - Path to BED file with regions.
 * @param   {string}                    outputFile              - The output file name.
 * @param   {string}                    indexFile               - The path to the downloaded .bai index file.
 * @param   {import('winston').Logger}  logger                  - The logger instance.
 * @param   {import('./types').Metrics} metrics                 - Metrics object for tracking stats.
 * @param   {boolean}                   [overwrite=false]       - Flag indicating whether to overwrite existing files.
 * @param   {boolean}                   [includeUnmapped=false] - Also include unmapped reads (wildcard '*' region).
 * @param   {string[]}                  [regions=[]]            - Genomic regions in chr:start-end format (used when includeUnmapped is true).
 * @param   {ProxyOptions}              [proxyOptions={}]       - Options for bounded-range reverse proxy.
 * @returns {Promise<void>}
 */
async function rangedDownloadBAM(
  url,
  bedFile,
  outputFile,
  indexFile,
  logger,
  metrics,
  overwrite = false,
  includeUnmapped = false,
  regions = [],
  proxyOptions = {},
) {
  // check if output BAM file already exists and skip download if overwrite is false
  if (fs.existsSync(outputFile) && !overwrite) {
    logger.info(`BAM file already exists: ${outputFile}, skipping download.`);
    metrics.totalFilesSkipped += 1;
    return;
  }

  /** @type {import('./net/boundedRangeProxy.cjs').BoundedRangeProxyInstance | undefined} */
  let proxy;
  try {
    let effectiveUrl = url;
    // create bounded range reverse proxy if enabled
    if (proxyOptions?.enabled !== false) {
      proxy = await createBoundedRangeProxy(url, {
        chunkSize: proxyOptions?.chunkSize,
        logger,
      });
      effectiveUrl = proxy.proxyUrl;
    }

    let args;

    if (includeUnmapped) {
      // when including unmapped reads, use command-line regions instead of BED file
      // because samtools -L (BED) and -M don't support the '*' wildcard
      // note: -M (multi-region iterator) is deliberately omitted here because it
      // is only needed with -L (BED) to optimize overlapping region merging
      // with command-line regions, samtools handles them correctly without -M
      logger.debug(
        'Using command-line regions with unmapped wildcard for combined download',
      );
      args = [
        'view',
        '-b',
        '-X',
        effectiveUrl,
        indexFile,
        ...regions,
        '*',
        '-o',
        outputFile,
      ];
    } else {
      // standard ranged download using BED file
      logger.debug(`Downloading BAM for regions in BED file: ${bedFile}`);
      args = [
        'view',
        '-b',
        '-X',
        effectiveUrl,
        indexFile,
        '-L',
        bedFile,
        '-M',
        '-o',
        outputFile,
      ];
    }

    logger.info(`Running command: samtools ${args.join(' ')}`);

    await spawnPromise('samtools', args, logger);
    logger.info(`Downloaded BAM file to ${outputFile}`);
    metrics.totalFilesDownloaded += 1;
  } catch (error) {
    // clean up partial output file on failure
    if (fs.existsSync(outputFile)) {
      try {
        fs.unlinkSync(outputFile);
        logger.debug(`Cleaned up partial file: ${outputFile}`);
      } catch {
        /* ignore cleanup errors */
      }
    }
    logger.error(
      `Error performing ranged download for BAM: ${getErrorMessage(error)}`,
    );
    throw error;
  } finally {
    // ensure proxy server is closed
    if (proxy) {
      try {
        await proxy.close();
      } catch {
        /* ignore proxy close errors */
      }
    }
  }
}

/**
 * Performs a ranged download for a VCF file using a tabix -> bgzip pipeline.
 * @param   {string}                    url               - The URL of the VCF.gz file.
 * @param   {string}                    range             - The genomic range (e.g., 'chr1:1-100000').
 * @param   {string}                    outputFile        - The output file name (will be compressed as .vcf.gz).
 * @param   {string}                    indexFile         - The local path to the downloaded .tbi index file.
 * @param   {import('winston').Logger}  logger            - The logger instance.
 * @param   {import('./types').Metrics} metrics           - Metrics object for tracking stats.
 * @param   {boolean}                   [overwrite=false] - Flag indicating whether to overwrite existing files.
 * @param   {ProxyOptions}              [proxyOptions={}] - Options for bounded-range reverse proxy.
 * @returns {Promise<void>}
 */
async function rangedDownloadVCF(
  url,
  range,
  outputFile,
  indexFile,
  logger,
  metrics,
  overwrite = false,
  proxyOptions = {},
) {
  // check if output VCF file already exists and skip download if overwrite is false
  if (fs.existsSync(outputFile) && !overwrite) {
    logger.info(`VCF file already exists: ${outputFile}, skipping download.`);
    metrics.totalFilesSkipped += 1;
    return;
  }

  /** @type {import('./net/boundedRangeProxy.cjs').BoundedRangeProxyInstance | undefined} */
  let proxy;
  let effectiveUrl = url;
  // create bounded range reverse proxy if enabled
  if (proxyOptions?.enabled !== false) {
    proxy = await createBoundedRangeProxy(url, {
      chunkSize: proxyOptions?.chunkSize,
      logger,
    });
    effectiveUrl = proxy.proxyUrl;
  }

  // close proxy server on completion or error
  const closeProxy = async () => {
    if (proxy) {
      try {
        await proxy.close();
      } catch {
        /* ignore proxy close errors */
      }
    }
  };

  return new Promise((resolve, reject) => {
    // for tabix to work with remote URLs:
    // 1. The index file must already be downloaded (handled by ensureIndexFile)
    // 2. Execute tabix in the directory containing the index file
    // 3. The index file must be named exactly as expected by tabix (basename.vcf.gz.tbi)

    // get directory where the index file is located
    const indexDir = path.dirname(indexFile);

    // spawn tabix directly to extract the region with header
    logger.info(`Executing in ${indexDir}: tabix -h ${effectiveUrl} ${range}`);
    const tabixProcess = spawn('tabix', ['-h', effectiveUrl, range], {
      cwd: indexDir,
    });

    // spawn bgzip to compress the output
    const bgzipArgs = ['-c'];
    logger.info(`Piping to: bgzip -c`);
    const bgzipProcess = spawn('bgzip', bgzipArgs);

    // create write stream for the final output file
    const outputStream = fs.createWriteStream(outputFile);

    // track completion states to avoid race conditions
    /** @type {string|null} */
    let processError = null;
    let bgzipClosed = false;
    let streamFinished = false;
    let resolved = false;

    // clean up partial output file on error
    const cleanup = () => {
      if (fs.existsSync(outputFile) && processError) {
        try {
          fs.unlinkSync(outputFile);
        } catch {
          // ignore cleanup errors
        }
      }
    };

    // try resolving promise when all stream and process stages finish
    const tryResolve = async () => {
      if (resolved) return;
      if (bgzipClosed && streamFinished) {
        resolved = true;
        await closeProxy();
        if (processError) {
          cleanup();
          reject(new Error(processError));
        } else {
          logger.info(`Ranged VCF download complete: ${outputFile}`);
          metrics.totalFilesDownloaded += 1;
          resolve();
        }
      }
    };

    /**
     * Abort pipeline and reject immediately on process or stream error.
     *
     * @param   {string}                  procName - Name of the failing process/stream.
     * @param   {Error|{message: string}} err      - Failure error.
     * @returns {Promise<void>}
     */
    const failImmediately = async (procName, err) => {
      if (resolved) return;
      resolved = true;
      if (!processError) processError = `Error in ${procName}: ${err.message}`;
      await closeProxy();
      cleanup();
      reject(new Error(processError));
    };

    // pipe stdout of tabix to stdin of bgzip
    tabixProcess.stdout.pipe(bgzipProcess.stdin);

    // pipe stdout of bgzip to output file stream
    bgzipProcess.stdout.pipe(outputStream);

    const MAX_STDERR_BUFFER = 65536;
