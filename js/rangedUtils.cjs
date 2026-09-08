const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { downloadFile } = require('./fileUtils.cjs');
const {
  spawnPromise,
  compareVersions,
  checkToolAvailability,
} = require('./toolChecks.cjs');
const { getErrorMessage } = require('./errorUtils.cjs');

/**
 * Performs a ranged download for a BAM file using samtools.
 * @param   {string}                    url             - The URL of the BAM file.
 * @param   {string}                    bedFile         - Path to BED file with regions.
 * @param   {string}                    outputFile      - The output file name.
 * @param   {string}                    indexFile       - The path to the downloaded .bai index file.
 * @param   {import('winston').Logger}  logger          - The logger instance.
 * @param   {import('./types').Metrics} metrics         - Metrics object for tracking stats.
 * @param   {boolean}                   overwrite       - Flag indicating whether to overwrite existing files.
 * @param   {boolean}                   includeUnmapped - Also include unmapped reads (wildcard '*' region).
 * @param   {string[]}                  regions         - Genomic regions in chr:start-end format (used when includeUnmapped is true).
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
) {
  try {
    // Check if the output BAM file already exists and skip download if overwrite is false
    if (fs.existsSync(outputFile) && !overwrite) {
      logger.info(`BAM file already exists: ${outputFile}, skipping download.`);
      metrics.totalFilesSkipped += 1;
      return;
    }

    let args;

    if (includeUnmapped) {
      // When including unmapped reads, use command-line regions instead of BED file
      // because samtools -L (BED) and -M don't support the '*' wildcard.
      // Note: -M (multi-region iterator) is deliberately omitted here because it
      // is only needed with -L (BED) to optimize overlapping region merging.
      // With command-line regions, samtools handles them correctly without -M.
      logger.debug(
        'Using command-line regions with unmapped wildcard for combined download',
      );
      args = [
        'view',
        '-b',
        '-X',
        url,
        indexFile,
        ...regions,
        '*',
        '-o',
        outputFile,
      ];
    } else {
      // Standard ranged download using BED file
      logger.debug(`Downloading BAM for regions in BED file: ${bedFile}`);
      args = [
        'view',
        '-b',
        '-X',
        url,
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
    // Clean up partial output file on failure
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
  }
}

/**
 * Performs a ranged download for a VCF file using a tabix -> bgzip pipeline.
 * @param   {string}                    url        - The URL of the VCF.gz file.
 * @param   {string}                    range      - The genomic range (e.g., 'chr1:1-100000').
 * @param   {string}                    outputFile - The output file name (will be compressed as .vcf.gz).
 * @param   {string}                    indexFile  - The local path to the downloaded .tbi index file.
 * @param   {import('winston').Logger}  logger     - The logger instance.
 * @param   {import('./types').Metrics} metrics    - Metrics object for tracking stats.
 * @param   {boolean}                   overwrite  - Flag indicating whether to overwrite existing files.
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
) {
  if (fs.existsSync(outputFile) && !overwrite) {
    logger.info(`VCF file already exists: ${outputFile}, skipping download.`);
    metrics.totalFilesSkipped += 1;
    return;
  }

  return new Promise((resolve, reject) => {
    // For tabix to work with remote URLs:
    // 1. The index file must already be downloaded (handled by ensureIndexFile)
    // 2. Execute tabix in the directory containing the index file
    // 3. The index file must be named exactly as expected by tabix (basename.vcf.gz.tbi)

    // Get the directory where the index file is located
    const indexDir = path.dirname(indexFile);

    // Command 1: tabix to extract the region with header.
    // Spawn tabix directly with an argv array (no shell) so the URL and range
    // are inert to shell metacharacters — matching the safe BAM path.
    logger.info(`Executing in ${indexDir}: tabix -h ${url} ${range}`);
    const tabixProcess = spawn('tabix', ['-h', url, range], {
      cwd: indexDir, // Execute in the directory where the index file is located
    });

    // Command 2: bgzip to compress the output
    const bgzipArgs = ['-c'];
    logger.info(`Piping to: bgzip -c`);
    const bgzipProcess = spawn('bgzip', bgzipArgs);

    // Create a write stream for the final output file
    const outputStream = fs.createWriteStream(outputFile);

    // Track completion states to avoid race conditions
    /** @type {string|null} */
    let processError = null;
    let bgzipClosed = false;
    let streamFinished = false;
    let resolved = false;

    const cleanup = () => {
      if (fs.existsSync(outputFile) && processError) {
        try {
          fs.unlinkSync(outputFile);
        } catch {
          // Ignore cleanup errors
        }
      }
    };

    const tryResolve = () => {
      if (resolved) return;
      if (bgzipClosed && streamFinished) {
        resolved = true;
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

    // Pipe stdout of tabix to stdin of bgzip
    tabixProcess.stdout.pipe(bgzipProcess.stdin);

    // Pipe stdout of bgzip to the output file
    bgzipProcess.stdout.pipe(outputStream);

    const MAX_STDERR_BUFFER = 65536;
    let tabixError = '';
    tabixProcess.stderr.on('data', (data) => {
      if (tabixError.length < MAX_STDERR_BUFFER) {
        tabixError += data
          .toString()
          .slice(0, MAX_STDERR_BUFFER - tabixError.length);
      }
      logger.debug(`[tabix stderr]: ${data.toString().trim()}`);
    });

    let bgzipError = '';
    bgzipProcess.stderr.on('data', (data) => {
      if (bgzipError.length < MAX_STDERR_BUFFER) {
        bgzipError += data
          .toString()
          .slice(0, MAX_STDERR_BUFFER - bgzipError.length);
      }
      logger.debug(`[bgzip stderr]: ${data.toString().trim()}`);
    });

    /**
     * Records the first process error encountered in the pipeline.
     *
     * @param {string} procName - Process name for the diagnostic message.
     * @param {Error}  err      - Process error.
     */
    const onProcessError = (procName, err) => {
      if (!processError) processError = `Error in ${procName}: ${err.message}`;
    };

    tabixProcess.on('error', (err) => onProcessError('tabix', err));
    bgzipProcess.on('error', (err) => onProcessError('bgzip', err));
    outputStream.on('error', (err) => {
      onProcessError('outputStream', err);
      if (!tabixProcess.killed) tabixProcess.kill('SIGTERM');
      if (!bgzipProcess.killed) bgzipProcess.kill('SIGTERM');
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error(processError || err.message));
      }
    });

    // Register finish handler BEFORE piping to avoid race conditions
    outputStream.on('finish', () => {
      streamFinished = true;
      tryResolve();
    });

    // --- Completion Handling ---
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
      // Don't resolve here; wait for bgzip and stream to finish
    });
  });
}

/**
 * Extracts unmapped reads from a remote BAM file using samtools.
 * Uses the wildcard chromosome '*' to target reads with no reference assignment.
 * This is particularly useful for Illumina NovaSeq data where unmapped reads
 * may contain contamination, adapter sequences, or novel sequences of interest.
 * @param   {string}                    url        - The URL of the BAM file.
 * @param   {string}                    outputFile - The output file name.
 * @param   {string}                    indexFile  - The path to the downloaded .bai index file.
 * @param   {import('winston').Logger}  logger     - The logger instance.
 * @param   {import('./types').Metrics} metrics    - Metrics object for tracking stats.
 * @param   {boolean}                   overwrite  - Flag indicating whether to overwrite existing files.
 * @returns {Promise<void>}
 */
async function unmappedDownloadBAM(
  url,
  outputFile,
  indexFile,
  logger,
  metrics,
  overwrite = false,
) {
  try {
    if (fs.existsSync(outputFile) && !overwrite) {
      logger.info(
        `Unmapped reads BAM file already exists: ${outputFile}, skipping download.`,
      );
      metrics.totalFilesSkipped += 1;
      return;
    }

    logger.debug('Extracting unmapped reads from BAM file');
    const args = ['view', '-b', '-X', url, indexFile, '*', '-o', outputFile];
    logger.info(`Running command: samtools ${args.join(' ')}`);

    await spawnPromise('samtools', args, logger);
    logger.info(`Extracted unmapped reads to ${outputFile}`);
    metrics.totalFilesDownloaded += 1;
  } catch (error) {
    // Clean up partial output file on failure
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
  const safeFileName = path.basename(fileName.replace(/\\/g, '/'));
  logger.debug(
    `Generating output file name for file: ${safeFileName} with regions: ${JSON.stringify(regions)}`,
  );

  // If no regions are provided, return the original filename. This covers full downloads for any file type.
  // The check for regions[0] === '' handles the case where an empty string might be passed from argument parsing.
  if (
    !regions ||
    regions.length === 0 ||
    (regions.length === 1 && regions[0] === '')
  ) {
    logger.debug(
      `No regions provided. Returning original filename: ${safeFileName}`,
    );
    return safeFileName;
  }

  // Handle compound extensions like .vcf.gz, .bam.bai properly
  let extension, baseName;

  if (safeFileName.endsWith('.vcf.gz')) {
    extension = '.vcf.gz';
    baseName = safeFileName.slice(0, -7); // Remove .vcf.gz
  } else if (safeFileName.endsWith('.vcf.gz.tbi')) {
    extension = '.vcf.gz.tbi';
    baseName = safeFileName.slice(0, -11); // Remove .vcf.gz.tbi
  } else if (safeFileName.endsWith('.bam.bai')) {
    extension = '.bam.bai';
    baseName = safeFileName.slice(0, -8); // Remove .bam.bai
  } else {
    extension = path.extname(safeFileName);
    baseName = path.basename(safeFileName, extension);
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
