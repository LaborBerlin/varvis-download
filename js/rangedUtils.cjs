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

    // handle stderr buffers
    let tabixError = '';
    tabixProcess.stderr.on('data', (data) => {
      tabixError += data.toString();
      logger.debug(`[tabix stderr]: ${data.toString().trim()}`);
    });

    let bgzipError = '';
    bgzipProcess.stderr.on('data', (data) => {
      bgzipError += data.toString();
      logger.debug(`[bgzip stderr]: ${data.toString().trim()}`);
    });

    // listen for process and stream errors
    tabixProcess.on('error', (err) => failImmediately('tabix', err));
    bgzipProcess.on('error', (err) => failImmediately('bgzip', err));
    outputStream.on('error', (err) => failImmediately('outputStream', err));

    // register finish handler before piping finishes
    outputStream.on('finish', () => {
      streamFinished = true;
      tryResolve();
    });

    // handle process exits
    bgzipProcess.on('close', (code) => {
      if (code !== 0 && !processError) {
        processError = `bgzip process exited with code ${code}. Stderr: ${bgzipError}`;
      }
      bgzipClosed = true;
      tryResolve();
    });

    tabixProcess.on('close', (code) => {
      if (code !== 0 && !processError) {
        processError = `tabix process exited with code ${code}. Stderr: ${tabixError}`;
      }
      // don't resolve here; wait for bgzip and stream to finish
    });
  });
}

/**
 * Extracts unmapped reads from a remote BAM file using samtools.
 * Uses the wildcard chromosome '*' to target reads with no reference assignment.
 * This is particularly useful for Illumina NovaSeq data where unmapped reads
 * may contain contamination, adapter sequences, or novel sequences of interest.
 * @param   {string}                    url               - The URL of the BAM file.
 * @param   {string}                    outputFile        - The output file name.
 * @param   {string}                    indexFile         - The path to the downloaded .bai index file.
 * @param   {import('winston').Logger}  logger            - The logger instance.
 * @param   {import('./types').Metrics} metrics           - Metrics object for tracking stats.
 * @param   {boolean}                   [overwrite=false] - Flag indicating whether to overwrite existing files.
 * @param   {ProxyOptions}              [proxyOptions={}] - Options for bounded-range reverse proxy.
 * @returns {Promise<void>}
 */
async function unmappedDownloadBAM(
  url,
  outputFile,
  indexFile,
  logger,
  metrics,
  overwrite = false,
  proxyOptions = {},
) {
  // check if output BAM file already exists and skip download if overwrite is false
  if (fs.existsSync(outputFile) && !overwrite) {
    logger.info(
      `Unmapped reads BAM file already exists: ${outputFile}, skipping download.`,
    );
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

    logger.debug('Extracting unmapped reads from BAM file');
    const args = [
      'view',
      '-b',
      '-X',
      effectiveUrl,
      indexFile,
      '*',
      '-o',
      outputFile,
    ];
    logger.info(`Running command: samtools ${args.join(' ')}`);

    await spawnPromise('samtools', args, logger);
    logger.info(`Extracted unmapped reads to ${outputFile}`);
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
    logger.error(`Error extracting unmapped reads: ${getErrorMessage(error)}`);
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
 * Indexes a BAM file using samtools.
 * @param   {string}                   bamFile   - The path to the BAM file.
 * @param   {import('winston').Logger} logger    - The logger instance.
 * @param   {boolean}                  overwrite - Flag indicating whether to overwrite existing index files.
 * @returns {Promise<void>}
 */
async function indexBAM(bamFile, logger, overwrite = false) {
  const indexFile = `${bamFile}.bai`;
  if (fs.existsSync(indexFile) && !overwrite) {
    logger.info(`Index file already exists: ${indexFile}, skipping indexing.`);
    return;
  }

  try {
    const args = ['index', bamFile];
    logger.info(`Indexing BAM file: ${bamFile}`);
    await spawnPromise('samtools', args, logger);
    logger.info(`Indexed BAM file: ${bamFile}`);
  } catch (error) {
    logger.error(`Error indexing BAM file: ${getErrorMessage(error)}`);
    throw error;
  }
}

/**
 * Indexes a VCF.gz file using tabix.
 * @param   {string}                   vcfGzFile - The path to the VCF.gz file.
 * @param   {import('winston').Logger} logger    - The logger instance.
 * @param   {boolean}                  overwrite - Flag indicating whether to overwrite existing index files.
 * @returns {Promise<void>}
 */
async function indexVCF(vcfGzFile, logger, overwrite = false) {
  const indexFile = `${vcfGzFile}.tbi`;
  if (fs.existsSync(indexFile) && !overwrite) {
    logger.info(`Index file already exists: ${indexFile}, skipping indexing.`);
    return;
  }

  try {
    const args = ['-p', 'vcf', vcfGzFile];
    logger.info(`Indexing VCF.gz file: ${vcfGzFile}`);
    await spawnPromise('tabix', args, logger);
    logger.info(`Indexed VCF.gz file: ${vcfGzFile}`);
  } catch (error) {
    logger.error(`Error indexing VCF.gz file: ${getErrorMessage(error)}`);
    throw error;
  }
}

/**
 * Ensures that the required index file is downloaded for a BAM or VCF file.
 * @param   {string}                                 fileUrl       - The URL of the BAM or VCF file.
 * @param   {string}                                 indexUrl      - The URL of the index file (.bai or .tbi).
 * @param   {string}                                 indexFilePath - The local path to the index file.
 * @param   {import('./types').HttpDispatcher}       agent         - The HTTP agent instance.
 * @param   {import('node:readline').Interface|null} rl            - The readline interface instance.
 * @param   {import('winston').Logger}               logger        - The logger instance.
 * @param   {import('./types').Metrics}              metrics       - The metrics object for tracking download stats.
 * @param   {boolean}                                overwrite     - Flag indicating whether to overwrite existing files.
 * @returns {Promise<void>}
 */
async function ensureIndexFile(
  fileUrl,
  indexUrl,
  indexFilePath,
  agent,
  rl,
  logger,
  metrics,
  overwrite = false,
) {
  if (fs.existsSync(indexFilePath) && !overwrite) {
    logger.info(`Index file already exists: ${indexFilePath}`);
    return;
  }

  try {
    logger.info(`Downloading index file from ${indexUrl} to ${indexFilePath}`);
    await downloadFile(
      indexUrl,
      indexFilePath,
      overwrite,
      agent,
      rl,
      logger,
      metrics,
    );
    logger.info(`Downloaded index file to ${indexFilePath}`);
  } catch (error) {
    logger.error(`Error downloading index file: ${getErrorMessage(error)}`);
    throw error;
  }
}

/**
 * Generates an output file name by appending the genomic range or "multiple-regions" if more than one range is provided.
 * If no regions are provided, the original filename is returned. This applies to all file types (BAM, VCF, etc.).
 * @param   {string}                   fileName - The original file name.
 * @param   {string|string[]|null}     regions  - A string representing a single genomic range or an array of multiple regions.
 * @param   {import('winston').Logger} logger   - The logger instance.
 * @returns {string}                            - The new file name with the range appended, or the original file name.
 */
function generateOutputFileName(fileName, regions, logger) {
  logger.debug(
    `Generating output file name for file: ${fileName} with regions: ${JSON.stringify(regions)}`,
  );

  // If no regions are provided, return the original filename. This covers full downloads for any file type.
  // The check for regions[0] === '' handles the case where an empty string might be passed from argument parsing.
  if (
    !regions ||
    regions.length === 0 ||
    (regions.length === 1 && regions[0] === '')
  ) {
    logger.debug(
      `No regions provided. Returning original filename: ${fileName}`,
    );
    return fileName;
  }

  // Handle compound extensions like .vcf.gz, .bam.bai properly
  let extension, baseName;

  if (fileName.endsWith('.vcf.gz')) {
    extension = '.vcf.gz';
    baseName = fileName.slice(0, -7); // Remove .vcf.gz
  } else if (fileName.endsWith('.vcf.gz.tbi')) {
    extension = '.vcf.gz.tbi';
    baseName = fileName.slice(0, -11); // Remove .vcf.gz.tbi
  } else if (fileName.endsWith('.bam.bai')) {
    extension = '.bam.bai';
    baseName = fileName.slice(0, -8); // Remove .bam.bai
  } else {
    extension = path.extname(fileName);
    baseName = path.basename(fileName, extension);
  }

  let suffix;
  if (Array.isArray(regions) && regions.length > 1) {
    suffix = 'multiple-regions';
  } else {
    // This logic now only runs when regions has at least one valid element.
    const sanitizedRegion = regions.toString().replace(/[:-]/g, '_'); // Replace colon and dash with underscores
    suffix = sanitizedRegion;
  }

  const newFileName = `${baseName}.${suffix}${extension}`;
  logger.debug(`Generated output file name: ${newFileName}`);

  return newFileName;
}

module.exports = {
  // Re-export from toolChecks for backwards compatibility
  checkToolAvailability,
  compareVersions,
  // Core ranged download functions
  rangedDownloadBAM,
  rangedDownloadVCF,
  unmappedDownloadBAM,
  ensureIndexFile,
  generateOutputFileName,
  indexBAM,
  indexVCF,
};
