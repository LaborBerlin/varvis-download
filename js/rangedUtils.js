const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { downloadFile } = require('./fileUtils');

// Define minimum required versions for external tools
const SAMTOOLS_MIN_VERSION = '1.17';
const TABIX_MIN_VERSION = '1.20';
const BGZIP_MIN_VERSION = '1.20';

/**
 * Wraps spawn in a Promise to maintain async/await syntax.
 * @param {string} command - The command to execute.
 * @param {Array<string>} args - The command arguments.
 * @param {Object} logger - The logger instance.
 * @param {boolean} captureOutput - Whether to capture stdout for return value.
 * @returns {Promise<Object>} - Resolves with result object when the process completes successfully.
 */
function spawnPromise(command, args, logger, captureOutput = false) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args);
    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      const output = data.toString();
      if (captureOutput) {
        stdout += output;
      }
      logger.debug(`[${command}] stdout: ${output.trim()}`);
    });

    process.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
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
 * @param {string} tool - The name of the tool (samtools, tabix, or bgzip).
 * @param {string} versionCommand - Command to check the tool version.
 * @param {string} minVersion - The minimal required version.
 * @param {Object} logger - The logger instance.
 * @returns {Promise<boolean>} - Resolves to true if the tool is available and meets the version requirement.
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
 * @param {string} version - The current version.
 * @param {string} minVersion - The minimum required version.
 * @returns {boolean} - True if the current version is >= the minimum version.
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
 * @param {string} url - The URL of the BAM file.
 * @param {string} range - The genomic range (e.g., 'chr1:1-100000').
 * @param {string} outputFile - The output file name.
 * @param {string} indexFile - The path to the downloaded .bai index file.
 * @param {Object} logger - The logger instance.
 * @param {boolean} overwrite - Flag indicating whether to overwrite existing files.
 * @returns {Promise<void>}
 */
async function rangedDownloadBAM(
  url,
  bedFile,
  outputFile,
  indexFile,
  logger,
  overwrite = false,
) {
  try {
    // Check if the output BAM file already exists and skip download if overwrite is false
    if (fs.existsSync(outputFile) && !overwrite) {
      logger.info(`BAM file already exists: ${outputFile}, skipping download.`);
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
  } catch (error) {
    logger.error(`Error performing ranged download for BAM: ${error.message}`);
    throw error;
  }
}

/**
 * Performs a ranged download for a VCF file using tabix, and compresses it using bgzip.
 * @param {string} url - The URL of the VCF file.
 * @param {string} range - The genomic range (e.g., 'chr1:1-100000').
 * @param {string} outputFile - The output file name (compressed as .vcf.gz).
 * @param {Object} logger - The logger instance.
 * @param {boolean} overwrite - Flag indicating whether to overwrite existing files.
 * @returns {Promise<void>}
 */
async function rangedDownloadVCF(
  url,
  range,
  outputFile,
  logger,
  overwrite = false,
) {
  try {
    // Check if the output VCF file already exists and skip if overwrite is false
    if (fs.existsSync(outputFile) && !overwrite) {
      logger.info(`VCF file already exists: ${outputFile}, skipping download.`);
      return;
    }

    const tempOutputFile = outputFile.replace('.gz', ''); // Temporary file for tabix output

    // Use tabix to extract range and write to temp file
    logger.info(`Running command: tabix ${url} ${range}`);
    const tabixResult = await spawnPromise('tabix', [url, range], logger, true);
    fs.writeFileSync(tempOutputFile, tabixResult.stdout);
    logger.info(`Downloaded VCF file range to ${tempOutputFile}`);

    // Compress with bgzip
    const args = ['-c', tempOutputFile];
    logger.info(`Running command to compress the VCF: bgzip ${args.join(' ')}`);
    const bgzipResult = await spawnPromise('bgzip', args, logger, true);
    fs.writeFileSync(outputFile, bgzipResult.stdout);
    logger.info(`Compressed VCF to ${outputFile}`);

    // Clean up the temporary uncompressed file
    fs.unlinkSync(tempOutputFile);
  } catch (error) {
    logger.error(`Error performing ranged download for VCF: ${error.message}`);
    throw error;
  }
}

/**
 * Indexes a BAM file using samtools.
 * @param {string} bamFile - The path to the BAM file.
 * @param {Object} logger - The logger instance.
 * @param {boolean} overwrite - Flag indicating whether to overwrite existing index files.
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
 * @param {string} vcfGzFile - The path to the VCF.gz file.
 * @param {Object} logger - The logger instance.
 * @param {boolean} overwrite - Flag indicating whether to overwrite existing index files.
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
 * @param {string} fileUrl - The URL of the BAM or VCF file.
 * @param {string} indexUrl - The URL of the index file (.bai or .tbi).
 * @param {string} indexFilePath - The local path to the index file.
 * @param {Object} agent - The HTTP agent instance.
 * @param {Object} rl - The readline interface instance.
 * @param {Object} logger - The logger instance.
 * @param {Object} metrics - The metrics object for tracking download stats.
 * @param {boolean} overwrite - Flag indicating whether to overwrite existing files.
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
 * @param {string} fileName - The original file name.
 * @param {string | string[]} regions - A string representing a single genomic range or an array of multiple regions.
 * @param {Object} logger - The logger instance.
 * @returns {string} - The new file name with the range appended, or the original file name.
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

  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);

  let suffix;
  if (Array.isArray(regions) && regions.length > 1) {
    suffix = 'multiple-regions';
  } else {
    // This logic now only runs when regions has at least one valid element.
    const sanitizedRegion = regions.toString().replace(/[:\-]/g, '_'); // Replace colon and dash with underscores
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
