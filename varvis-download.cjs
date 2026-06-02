#!/usr/bin/env node

// Load environment variables from .env file
require('dotenv').config({ quiet: true });

const { hideBin } = require('yargs/helpers');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const {
  version,
  name,
  author,
  license,
  repository,
} = require('./package.json');

const { loadLogo, getLastModifiedDate } = require('./js/configUtils.cjs');
const { buildParser } = require('./js/cli/args.cjs');
const { mergeFromArgv } = require('./js/cli/configMerge.cjs');
const { formatVersionInfo } = require('./js/cli/versionInfo.cjs');
const { createHttpAgent } = require('./js/net/httpAgent.cjs');
const { promptForPassword } = require('./js/io/passwordPrompt.cjs');
const { ConfigurationError } = require('./js/errors.cjs');
const createLogger = require('./js/logger.cjs');
const AuthService = require('./js/authService.cjs');
const {
  fetchAnalysisIds,
  getDownloadLinks,
  refreshDownloadUrls,
  listAvailableFiles,
  generateReport,
  metrics,
} = require('./js/fetchUtils.cjs');
const {
  isUrlExpiringSoon,
  getUrlRemainingTime,
  formatRemainingTime,
} = require('./js/urlUtils.cjs');
const { downloadFile } = require('./js/fileUtils.cjs');
const {
  checkToolAvailability,
  ensureIndexFile,
  rangedDownloadBAM,
  rangedDownloadVCF,
  unmappedDownloadBAM,
  indexBAM,
  indexVCF,
  generateOutputFileName,
} = require('./js/rangedUtils.cjs');
// Rename the imported function to avoid collision.
const {
  resumeArchivedDownloads: resumeArchivedDownloadsFunc,
} = require('./js/archiveUtils.cjs');
const { getErrorMessage, getErrorStack } = require('./js/errorUtils.cjs');

// Command line arguments setup
/** @type {any} */
let argv;
argv = buildParser(hideBin(process.argv)).argv;

// Create logger instance
const logger = createLogger(argv);

// Show version information if the --version flag is set
if (argv.version) {
  const logo = loadLogo();
  const lastModified = getLastModifiedDate(__filename);
  console.log(
    formatVersionInfo({
      name,
      version,
      author,
      license,
      repository,
      lastModified,
      logo,
    }),
  );
  process.exit(0);
}

/** @type {import('./js/types').FinalConfig} */
let finalConfig;
try {
  finalConfig = mergeFromArgv(argv, process.env);
} catch (error) {
  if (error instanceof ConfigurationError) {
    logger.error(`Error: ${error.message}`);
    process.exit(error.exitCode || 1);
  }
  throw error;
}

const {
  target,
  password,
  analysisIds,
  sampleIds,
  limsIds,
  destination,
  proxy,
  proxyUsername,
  proxyPassword,
  overwrite,
  filetypes,
  reportfile,
  filters,
  restoreArchived,
  restorationFile,
} = finalConfig;
const userName = finalConfig.username;

const agent = createHttpAgent({
  proxy,
  proxyUsername,
  proxyPassword,
});

// Initialize AuthService instance
const authService = new AuthService(logger, agent);

/** @type {readline.Interface|null} */
let rl = null;

/**
 * Lazily creates the shared prompt interface for non-password prompts.
 * @returns {readline.Interface} - The shared prompt interface.
 */
function getPromptInterface() {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return rl;
}

/**
 * Closes the shared prompt interface if it was created.
 */
function closePromptInterface() {
  if (rl) {
    rl.close();
    rl = null;
  }
}

/**
 * Handles the output of download URLs, printing to console and/or writing to a file.
 * @param {string[]}                 urls     - An array of URL strings to output.
 * @param {string|null}              filePath - The path to the output file, or null to only use console.
 * @param {import('winston').Logger} logger   - The logger instance.
 */
function handleUrlListing(urls, filePath, logger) {
  if (urls.length === 0) {
    logger.info('No files matching the criteria were found. No URLs to list.');
    return;
  }

  const urlOutput = urls.join('\n');

  // Always print to console. We use console.log directly to ensure clean output for piping.
  console.log(urlOutput);

  // Optionally write to a file
  if (filePath) {
    try {
      fs.writeFileSync(filePath, urlOutput + '\n');
      logger.info(`Successfully saved ${urls.length} URLs to ${filePath}`);
    } catch (error) {
      logger.error(
        `Failed to write URLs to file ${filePath}: ${getErrorMessage(error)}`,
      );
    }
  }
}

/**
 * Returns an existing password or prompts interactively when possible.
 * @param   {string|undefined} currentPassword - Password from config sources.
 * @returns {Promise<string>}                  - Resolved password.
 */
async function resolvePassword(currentPassword) {
  if (currentPassword) {
    return currentPassword;
  }

  if (!process.stdin.isTTY) {
    throw new ConfigurationError(
      'Missing required argument --password (or set VARVIS_PASSWORD)',
    );
  }

  return promptForPassword();
}

// Main function to orchestrate the login and download process
const os = require('node:os'); // Import for generating temp file paths

/**
 * Checks if a download URL is expiring soon and refreshes it if needed.
 * This ensures long-running download sessions don't fail due to expired pre-signed URLs.
 *
 * @param   {import('./js/types').FileDict}       fileDict - The current file dictionary with download links.
 * @param   {string}                              fileName - The name of the file to check.
 * @param   {string}                              target   - The Varvis target (tenant).
 * @param   {string}                              token    - The CSRF token for authentication.
 * @param   {import('./js/types').HttpDispatcher} agent    - The HTTP agent instance.
 * @param   {import('winston').Logger}            logger   - The logger instance.
 * @returns {Promise<string>}                              - The valid download URL (refreshed if needed).
 */
async function getValidDownloadUrl(
  fileDict,
  fileName,
  target,
  token,
  agent,
  logger,
) {
  const file = fileDict[fileName];
  if (!file || !file.downloadLink) {
    throw new Error(`No download link found for file: ${fileName}`);
  }

  const downloadLink = file.downloadLink;

  // Check if URL is expiring soon
  if (isUrlExpiringSoon(downloadLink)) {
    const remainingTime = getUrlRemainingTime(downloadLink);
    const formattedTime =
      remainingTime !== null ? formatRemainingTime(remainingTime) : 'unknown';
    logger.warn(
      `Download URL for ${fileName} is expiring soon (${formattedTime} remaining). Refreshing...`,
    );

    // Get the analysis ID from the file object
    const analysisId = file.analysisId;
    if (!analysisId) {
      logger.warn(
        `No analysisId found for ${fileName}, using potentially expired URL`,
      );
      return downloadLink;
    }

    // Refresh URLs for this analysis
    const freshFileDict = await refreshDownloadUrls(
      analysisId,
      target,
      token,
      agent,
      logger,
    );

    // Update the original fileDict with fresh URLs
    for (const [fname, freshFile] of Object.entries(freshFileDict)) {
      if (fileDict[fname]) {
        fileDict[fname].downloadLink = freshFile.downloadLink;
      }
    }

    // Return the fresh URL
    const refreshedFile = freshFileDict[fileName];
    if (refreshedFile?.downloadLink) {
      logger.info(`URL refreshed successfully for ${fileName}`);
      return refreshedFile.downloadLink;
    }

    logger.warn(
      `Could not find refreshed URL for ${fileName}, using original URL`,
    );
  }

  return downloadLink;
}

/**
 * Main function to orchestrate the CLI workflow.
 * Handles authentication, file discovery, download/list operations, and archive restoration.
 * @returns {Promise<void>}
 */
async function main() {
  // If resumeArchivedDownloads flag is set, resume archived downloads and exit.
  if (finalConfig.resumeArchivedDownloads) {
    logger.info('Starting in archive resumption mode.');

    const finalPassword = await resolvePassword(password);

    // Authenticate before resuming downloads
    await authService.login(
      { username: userName, password: finalPassword },
      target,
    );

    logger.info('Resuming archived downloads as requested.');
    await resumeArchivedDownloadsFunc(
      restorationFile,
      destination,
      target,
      authService.token,
      agent,
      logger,
      overwrite,
    );

    logger.info('Archive resumption process complete.');
    process.exit(0);
  }

  try {
    logger.debug('Starting main function');

    // Ensure the destination directory exists
    if (!fs.existsSync(destination)) {
      logger.debug(`Creating destination directory: ${destination}`);
      fs.mkdirSync(destination, { recursive: true });
    }

    const finalPassword = await resolvePassword(password);

    logger.debug('Attempting to log in');
    await authService.login(
      { username: userName, password: finalPassword },
      target,
    );
    logger.debug('Login successful');

    // ***************** NEW CODE FOR -L FLAG *****************
    // If the -L flag is set, list available files for each analysis and exit.
    if (finalConfig.list) {
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
              finalConfig.latest,
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
      logger.info('Listing complete. Exiting.');
      process.exit(0);
    }
    // ***************** END NEW CODE *****************

    // If subsetting is needed, check that external tools are available.
    if (finalConfig.range || finalConfig.bed || finalConfig.unmapped) {
      const samtoolsMinVersion = '1.17';
      const samtoolsOK = await checkToolAvailability(
        'samtools',
        'samtools --version',
        samtoolsMinVersion,
        logger,
      );

      if (!samtoolsOK) {
        logger.error(
          'samtools is missing or outdated. Please install/update it and try again.',
        );
        process.exit(1);
      }

      // tabix and bgzip are only required for ranged downloads, not for unmapped extraction
      if (finalConfig.range || finalConfig.bed) {
        const tabixMinVersion = '1.7';
        const bgzipMinVersion = '1.7';
        const tabixOK = await checkToolAvailability(
          'tabix',
          'tabix --version',
          tabixMinVersion,
          logger,
        );
        const bgzipOK = await checkToolAvailability(
          'bgzip',
          'bgzip --version',
          bgzipMinVersion,
          logger,
        );
        if (!tabixOK || !bgzipOK) {
          logger.error(
            'One or more required external tools (tabix, bgzip) are missing or outdated. Please install/update them and try again.',
          );
          process.exit(1);
        }
      }
    }

    // Handle regions from command line or BED file
    /** @type {string[]} */
    let regions = [];
    /** @type {string|undefined} */
    let tempBedPath; // Initialize tempBedPath

    if (finalConfig.range) {
      regions = finalConfig.range.split(' ');
      logger.info(`Using regions from command line: ${regions}`);

      // Create a temporary BED file for samtools to read
      tempBedPath = path.join(os.tmpdir(), 'regions.bed');
      const bedContent = regions
        .map((region) => {
          const [chr, pos] = region.split(':');

          if (!pos) {
            // Chromosome-only region (e.g., "chr1")
            // For BAM files with samtools, we need coordinates, so use entire chromosome
            // For VCF files with tabix, chromosome-only works fine
            return `${chr}\t1\t300000000`; // Use large end coordinate to cover entire chromosome
          } else {
            // Standard chr:start-end format
            const [start, end] = pos.split('-');
            return `${chr}\t${start}\t${end}`;
          }
        })
        .join('\n');

      fs.writeFileSync(tempBedPath, bedContent);
      logger.info(`Generated temporary BED file: ${tempBedPath}`);
    } else if (finalConfig.bed) {
      try {
        const bedFileContent = fs.readFileSync(finalConfig.bed, 'utf8');
        regions = bedFileContent
          .split('\n')
          .filter((line) => line && !line.startsWith('#')) // Filter out comments and empty lines
          .map((line) => {
            const [chr, start, end] = line.split('\t');
            return `${chr}:${start}-${end}`;
          });
        logger.info(`Using regions from BED file: ${regions}`);

        // Create a temporary BED file for samtools to read
        tempBedPath = path.join(os.tmpdir(), 'regions.bed');
        fs.writeFileSync(tempBedPath, bedFileContent);
        logger.info(`Generated temporary BED file: ${tempBedPath}`);
      } catch (error) {
        logger.error(`Error reading BED file: ${getErrorMessage(error)}`);
        process.exit(1);
      }
    } else {
      logger.info('No regions provided. Proceeding with full file download.');
    }

    // Output file generation will happen inside the loop based on actual file types
    logger.info('Processing files for download...');

    // Fetch analysis IDs based on filters or sample IDs
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
            finalConfig.latest,
          );
    logger.info(`Fetched analysis IDs: ${ids}`);

    // Create options object for restoration context
    const optionsForRestoration = {
      destination: finalConfig.destination,
      overwrite: finalConfig.overwrite,
      range: finalConfig.range,
      bed: finalConfig.bed,
      unmapped: finalConfig.unmapped,
      restorationFile: finalConfig.restorationFile,
      filetypes: filetypes, // Save filetypes for restoration
    };

    // Collect all URLs if --list-urls flag is set
    /** @type {string[]} */
    const allUrls = [];

    for (const analysisId of ids) {
      logger.info(`Processing analysis ID: ${analysisId}`);
      // Pass the restoreArchived flag, rl, restorationFile, and options to getDownloadLinks
      const fileDict = await getDownloadLinks(
        analysisId,
        filetypes,
        target,
        authService.token,
        agent,
        logger,
        restoreArchived,
        getPromptInterface(),
        restorationFile,
        optionsForRestoration,
      );
      logger.debug(`Fetched download links for analysis ID ${analysisId}`);

      // Collect URLs for --list-urls functionality
      if (finalConfig.listUrls) {
        Object.values(fileDict).forEach((file) => {
          if (file.downloadLink) {
            allUrls.push(file.downloadLink);
          }
        });
        continue; // Skip to next analysis ID when listing URLs
      }

      // Filter for primary data files first (BAM, VCF.GZ)
      const primaryFiles = Object.entries(fileDict).filter(
        ([fname]) => fname.endsWith('.bam') || fname.endsWith('.vcf.gz'),
      );

      for (const [fileName, _file] of primaryFiles) {
        // Get a valid download URL, refreshing if the current one is expiring
        const downloadLink = await getValidDownloadUrl(
          fileDict,
          fileName,
          target,
          authService.token,
          agent,
          logger,
        );

        // Generate the output file name for the current file
        const outputFile = path.join(
          destination,
          generateOutputFileName(fileName, regions, logger),
        );

        if (fileName.endsWith('.bam')) {
          // BAM file processing - also refresh index URL if needed
          const indexFileName = `${fileName}.bai`;
          let indexFileUrl = fileDict[indexFileName]?.downloadLink;
          if (indexFileUrl && isUrlExpiringSoon(indexFileUrl)) {
            indexFileUrl = await getValidDownloadUrl(
              fileDict,
              indexFileName,
              target,
              authService.token,
              agent,
              logger,
            );
          }
          const indexFilePath = path.join(destination, `${fileName}.bai`);

          if (regions.length > 0 || finalConfig.unmapped) {
            // Ranged or unmapped downloads require an index file
            if (!indexFileUrl) {
              logger.error(
                `Index file for BAM (${fileName}) not found. Ranged/unmapped downloads require .bai index. Skipping.`,
              );
              continue;
            }

            // Ensure index file is downloaded
            await ensureIndexFile(
              downloadLink,
              indexFileUrl,
              indexFilePath,
              agent,
              getPromptInterface(),
              logger,
              metrics,
              overwrite,
            );

            if (regions.length > 0) {
              if (!tempBedPath) {
                throw new Error(
                  'Temporary BED file path missing for ranged BAM download.',
                );
              }
              // Ranged download (optionally including unmapped reads in the same BAM)
              try {
                const modeLabel = finalConfig.unmapped
                  ? 'ranged + unmapped'
                  : 'ranged';
                logger.info(
                  `Performing ${modeLabel} download for BAM file: ${fileName}`,
                );
                await rangedDownloadBAM(
                  downloadLink,
                  tempBedPath,
                  outputFile,
                  indexFilePath,
                  logger,
                  metrics,
                  overwrite,
                  finalConfig.unmapped,
                  regions,
                );
                await indexBAM(outputFile, logger, overwrite);
              } catch (error) {
                logger.error(
                  `Error during ranged download for ${fileName}: ${getErrorMessage(error)}`,
                );
              }
            } else {
              // Unmapped-only extraction (no regions specified)
              const unmappedOutputFile = path.join(
                destination,
                generateOutputFileName(fileName, ['unmapped'], logger),
              );
              try {
                logger.info(
                  `Extracting unmapped reads from BAM file: ${fileName}`,
                );
                await unmappedDownloadBAM(
                  downloadLink,
                  unmappedOutputFile,
                  indexFilePath,
                  logger,
                  metrics,
                  overwrite,
                );
                await indexBAM(unmappedOutputFile, logger, overwrite);
              } catch (error) {
                logger.error(
                  `Error extracting unmapped reads from ${fileName}: ${getErrorMessage(error)}`,
                );
              }
            }
          } else {
            // Perform full download - index file is optional
            try {
              logger.info(`Performing full download for BAM file: ${fileName}`);
              await downloadFile(
                downloadLink,
                outputFile,
                overwrite,
                agent,
                getPromptInterface(),
                logger,
                metrics,
              );

              // Download index file if available (optional for full downloads)
              if (indexFileUrl) {
                logger.info(`Downloading optional index file: ${fileName}.bai`);
                try {
                  await downloadFile(
                    indexFileUrl,
                    indexFilePath,
                    overwrite,
                    agent,
                    getPromptInterface(),
                    logger,
                    metrics,
                  );
                } catch (indexError) {
                  logger.warn(
                    `Failed to download index file ${fileName}.bai: ${getErrorMessage(indexError)}`,
                  );
                }
              } else {
                logger.info(
                  `Index file for ${fileName} not available, skipping index download.`,
                );
              }

              // Generate new index if needed
              await indexBAM(outputFile, logger, overwrite);
            } catch (error) {
              logger.error(
                `Error during full download for ${fileName}: ${getErrorMessage(error)}`,
              );
            }
          }
        } else if (fileName.endsWith('.vcf.gz') && finalConfig.unmapped) {
          // Unmapped extraction only applies to BAM files, skip VCF
          logger.info(
            `Skipping VCF file ${fileName} - unmapped read extraction only applies to BAM files.`,
          );
          continue;
        } else if (fileName.endsWith('.vcf.gz')) {
          // VCF file processing - also refresh index URL if needed
          const indexFileName = `${fileName}.tbi`;
          let indexFileUrl = fileDict[indexFileName]?.downloadLink;
          if (indexFileUrl && isUrlExpiringSoon(indexFileUrl)) {
            indexFileUrl = await getValidDownloadUrl(
              fileDict,
              indexFileName,
              target,
              authService.token,
              agent,
              logger,
            );
          }
          const indexFilePath = path.join(destination, `${fileName}.tbi`);

          if (regions.length > 0) {
            // For ranged downloads, index file is required
            if (!indexFileUrl) {
              logger.error(
                `Index file for VCF (${fileName}) not found. Ranged download requires .tbi index. Skipping ranged download.`,
              );
              continue;
            }

            // Ensure index file is downloaded for ranged access
            await ensureIndexFile(
              downloadLink,
              indexFileUrl,
              indexFilePath,
              agent,
              getPromptInterface(),
              logger,
              metrics,
              overwrite,
            );

            // For tabix, we must process one region at a time.
            for (const region of regions) {
              const regionSpecificOutputFile = path.join(
                destination,
                generateOutputFileName(fileName, [region], logger), // Pass region as an array
              );

              try {
                logger.info(
                  `Performing ranged download for VCF file: ${fileName} with region: ${region}`,
                );
                await rangedDownloadVCF(
                  downloadLink,
                  region,
                  regionSpecificOutputFile,
                  indexFilePath,
                  logger,
                  metrics,
                  overwrite,
                );

                // After successful download, index the newly created ranged file.
                await indexVCF(regionSpecificOutputFile, logger, overwrite);
              } catch (error) {
                logger.error(
                  `Error during ranged download for ${fileName} on region ${region}: ${getErrorMessage(error)}`,
                );
              }
            }
          } else {
            // Perform full download - index file is optional
            try {
              logger.info(`Performing full download for VCF file: ${fileName}`);
              await downloadFile(
                downloadLink,
                outputFile,
                overwrite,
                agent,
                getPromptInterface(),
                logger,
                metrics,
              );

              // Download index file if available (optional for full downloads)
              if (indexFileUrl) {
                logger.info(`Downloading optional index file: ${fileName}.tbi`);
                try {
                  await downloadFile(
                    indexFileUrl,
                    indexFilePath,
                    overwrite,
                    agent,
                    getPromptInterface(),
                    logger,
                    metrics,
                  );
                } catch (indexError) {
                  logger.warn(
                    `Failed to download index file ${fileName}.tbi: ${getErrorMessage(indexError)}`,
                  );
                }
              } else {
                logger.info(
                  `Index file for ${fileName} not available, skipping index download.`,
                );
              }

              // Generate new index if needed
              await indexVCF(outputFile, logger, overwrite);
            } catch (error) {
              logger.error(
                `Error during full download for ${fileName}: ${getErrorMessage(error)}`,
              );
            }
          }
        }
      }
    }

    // Handle URL listing if --list-urls flag is set
    if (finalConfig.listUrls) {
      handleUrlListing(allUrls, finalConfig.urlFile, logger);
      process.exit(0); // Exit successfully after listing URLs
    }

    logger.info('Download complete.');
    generateReport(reportfile, logger);

    // Clean up the temporary BED file if it was created
    if (tempBedPath) {
      fs.unlinkSync(tempBedPath);
      logger.info(`Deleted temporary BED file: ${tempBedPath}`);
    }

    // Exit successfully
    process.exit(0);
  } catch (error) {
    logger.error(`An error occurred: ${getErrorMessage(error)}`);
    const stack = getErrorStack(error);
    if (stack) {
      logger.debug(stack);
    }
    process.exit(1);
  } finally {
    closePromptInterface();
  }
}

main().catch((error) => {
  logger.error(`An unexpected error occurred: ${getErrorMessage(error)}`);
  const stack = getErrorStack(error);
  if (stack) {
    logger.debug(stack);
  }
  closePromptInterface();
  process.exit(1);
});
