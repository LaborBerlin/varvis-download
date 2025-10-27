const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { downloadFile } = require('./fileUtils.cjs');

// Define minimum required versions for external tools

/**
 * Wraps spawn in a Promise to maintain async/await syntax.
 * @param   {string}          command       - The command to execute.
 * @param   {Array<string>}   args          - The command arguments.
 * @param   {object}          logger        - The logger instance.
 * @param   {boolean}         captureOutput - Whether to capture stdout for return value.
 * @returns {Promise<object>}               - Resolves with result object when the process completes successfully.
 */
function spawnPromise(command, args, logger, captureOutput = false) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args);
    let stdout = '';

    process.stdout.on('data', (data) => {
      const output = data.toString();
      if (captureOutput) {
        stdout += output;
      }
      logger.debug(`[${command}] stdout: ${output.trim()}`);
    });

    process.stderr.on('data', (data) => {
      const output = data.toString();
      logger.debug(`[${command}] stderr: ${output.trim()}`);
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(captureOutput ? { stdout } : {});
      } else {
        reject(new Error(`Process ${command} exited with code ${code}`));
      }
    });

    process.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Checks if a tool is available and meets the minimum version.
 * @param   {string}           tool           - The name of the tool (samtools, tabix, or bgzip).
 * @param   {string}           versionCommand - Command to check the tool version.
 * @param   {string}           minVersion     - The minimal required version.
 * @param   {object}           logger         - The logger instance.
 * @returns {Promise<boolean>}                - Resolves to true if the tool is available and meets the version requirement.
 */
async function checkToolAvailability(tool, versionCommand, minVersion, logger) {
  try {
    // Parse the versionCommand to extract command and arguments
    const commandParts = versionCommand.split(/\s+/);
    const command = commandParts[0];
    const args = commandParts.slice(1);

    const { stdout } = await spawnPromise(command, args, logger, true);
    const parts = stdout.split(/\s+/);
    let toolVersion;
    // For tabix and bgzip, the second word is in parentheses, so the version is the third element.
    if (parts[1].startsWith('(')) {
      toolVersion = parts[2].trim();
    } else {
      toolVersion = parts[1].trim();
    }
    if (compareVersions(toolVersion, minVersion)) {
      logger.info(`${tool} version ${toolVersion} is available.`);
      return true;
    } else {
      logger.error(
        `${tool} version ${toolVersion} is less than the required version ${minVersion}.`,
      );
      return false;
    }
  } catch (error) {
    logger.error(`Error checking ${tool} version: ${error.message}`);
    return false;
  }
}

/**
 * Compares two versions (e.g., '1.10' vs '1.9').
 * @param   {string}  version    - The current version.
 * @param   {string}  minVersion - The minimum required version.
 * @returns {boolean}            - True if the current version is >= the minimum version.
 */
function compareVersions(version, minVersion) {
  const versionParts = version.split('.').map(Number);
  const minVersionParts = minVersion.split('.').map(Number);

  // Pad arrays to same length with zeros
  const maxLength = Math.max(versionParts.length, minVersionParts.length);
  while (versionParts.length < maxLength) versionParts.push(0);
  while (minVersionParts.length < maxLength) minVersionParts.push(0);

  // Compare each part from left to right
  for (let i = 0; i < maxLength; i++) {
    if (versionParts[i] > minVersionParts[i]) return true;
    if (versionParts[i] < minVersionParts[i]) return false;
  }

  // All parts are equal
  return true;
}

/**
 * Performs a ranged download for a BAM file using samtools.
 * @param   {string}                   url        - The URL of the BAM file.
 * @param   {string}                   bedFile    - Path to BED file with regions.
 * @param   {string}                   outputFile - The output file name.
 * @param   {string}                   indexFile  - The path to the downloaded .bai index file.
 * @param   {import('winston').Logger} logger     - The logger instance.
 * @param   {object}                   metrics    - Metrics object for tracking stats.
 * @param   {boolean}                  overwrite  - Flag indicating whether to overwrite existing files.
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
) {
  try {
    // Check if the output BAM file already exists and skip download if overwrite is false
    if (fs.existsSync(outputFile) && !overwrite) {
      logger.info(`BAM file already exists: ${outputFile}, skipping download.`);
      metrics.totalFilesSkipped += 1;
      return;
    }

    logger.debug(`Downloading BAM for regions in BED file: ${bedFile}`);
    const args = [
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
    logger.info(`Running command: samtools ${args.join(' ')}`);

    await spawnPromise('samtools', args, logger);
    logger.info(`Downloaded BAM file for regions in BED file to ${outputFile}`);
    metrics.totalFilesDownloaded += 1;
  } catch (error) {
    logger.error(`Error performing ranged download for BAM: ${error.message}`);
    throw error;
  }
}

/**
 * Performs a ranged download for a VCF file using a tabix -> bgzip pipeline.
 * @param   {string}                   url        - The URL of the VCF.gz file.
 * @param   {string}                   range      - The genomic range (e.g., 'chr1:1-100000').
 * @param   {string}                   outputFile - The output file name (will be compressed as .vcf.gz).
 * @param   {string}                   indexFile  - The local path to the downloaded .tbi index file.
 * @param   {import('winston').Logger} logger     - The logger instance.
 * @param   {object}                   metrics    - Metrics object for tracking stats.
 * @param   {boolean}                  overwrite  - Flag indicating whether to overwrite existing files.
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

    // Command 1: tabix to extract the region with header
    // CRITICAL: The URL must be quoted to handle special characters in query parameters
    const tabixCmd = `tabix -h "${url}" ${range}`;
    logger.info(`Executing in ${indexDir}: ${tabixCmd}`);
    const tabixProcess = spawn('sh', ['-c', tabixCmd], {
      cwd: indexDir, // Execute in the directory where the index file is located
    });

    // Command 2: bgzip to compress the output
    const bgzipArgs = ['-c'];
    logger.info(`Piping to: bgzip -c`);
    const bgzipProcess = spawn('bgzip', bgzipArgs);

    // Create a write stream for the final output file
    const outputStream = fs.createWriteStream(outputFile);

    // Pipe stdout of tabix to stdin of bgzip
    tabixProcess.stdout.pipe(bgzipProcess.stdin);

    // Pipe stdout of bgzip to the output file
    bgzipProcess.stdout.pipe(outputStream);

    // --- Error Handling ---
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

    let processError = null;

    const onProcessError = (procName, err) => {
      if (!processError) processError = `Error in ${procName}: ${err.message}`;
    };

    tabixProcess.on('error', (err) => onProcessError('tabix', err));
    bgzipProcess.on('error', (err) => onProcessError('bgzip', err));
    outputStream.on('error', (err) => onProcessError('outputStream', err));

    // --- Completion Handling ---
    bgzipProcess.on('close', (code) => {
      if (code !== 0) {
        // If bgzip fails, it's a critical error.
        if (!processError)
          processError = `bgzip process exited with code ${code}. Stderr: ${bgzipError}`;
        if (fs.existsSync(outputFile)) {
          fs.unlinkSync(outputFile); // Clean up partial file
        }
        return reject(new Error(processError));
      }

      // bgzip finished, now wait for the file stream to close.
      outputStream.on('finish', () => {
        if (processError) {
          if (fs.existsSync(outputFile)) {
            fs.unlinkSync(outputFile);
          }
          return reject(new Error(processError));
        }
        logger.info(`Ranged VCF download complete: ${outputFile}`);
        metrics.totalFilesDownloaded += 1;
        resolve();
      });
    });

    tabixProcess.on('close', (code) => {
      if (code !== 0) {
        if (!processError)
          processError = `tabix process exited with code ${code}. Stderr: ${tabixError}`;
        // Don't reject here; let bgzip finish/fail, then handle the error.
      }
    });
  });
}

/**
 * Indexes a BAM file using samtools.
 * @param   {string}        bamFile   - The path to the BAM file.
 * @param   {object}        logger    - The logger instance.
 * @param   {boolean}       overwrite - Flag indicating whether to overwrite existing index files.
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
    logger.error(`Error indexing BAM file: ${error.message}`);
    throw error;
  }
}

/**
 * Indexes a VCF.gz file using tabix.
 * @param   {string}        vcfGzFile - The path to the VCF.gz file.
 * @param   {object}        logger    - The logger instance.
 * @param   {boolean}       overwrite - Flag indicating whether to overwrite existing index files.
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
    logger.error(`Error indexing VCF.gz file: ${error.message}`);
    throw error;
  }
}

/**
 * Ensures that the required index file is downloaded for a BAM or VCF file.
 * @param   {string}        fileUrl       - The URL of the BAM or VCF file.
 * @param   {string}        indexUrl      - The URL of the index file (.bai or .tbi).
 * @param   {string}        indexFilePath - The local path to the index file.
 * @param   {object}        agent         - The HTTP agent instance.
 * @param   {object}        rl            - The readline interface instance.
 * @param   {object}        logger        - The logger instance.
 * @param   {object}        metrics       - The metrics object for tracking download stats.
 * @param   {boolean}       overwrite     - Flag indicating whether to overwrite existing files.
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
    logger.error(`Error downloading index file: ${error.message}`);
    throw error;
  }
}

/**
 * Generates an output file name by appending the genomic range or "multiple-regions" if more than one range is provided.
 * If no regions are provided, the original filename is returned. This applies to all file types (BAM, VCF, etc.).
 * @param   {string}            fileName - The original file name.
 * @param   {string | string[]} regions  - A string representing a single genomic range or an array of multiple regions.
 * @param   {object}            logger   - The logger instance.
 * @returns {string}                     - The new file name with the range appended, or the original file name.
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
  checkToolAvailability,
  compareVersions,
  rangedDownloadBAM,
  rangedDownloadVCF,
  ensureIndexFile,
  generateOutputFileName,
  indexBAM,
  indexVCF,
};
