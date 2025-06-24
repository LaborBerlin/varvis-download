#!/usr/bin/env node

// Load environment variables from .env file
require('dotenv').config();

const { CookieJar } = require('tough-cookie');
const { CookieClient } = require('http-cookie-agent/undici');
const yargs = require('yargs');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { ProxyAgent, Agent } = require('undici');
const {
  version,
  name,
  author,
  license,
  repository,
} = require('./package.json');

const {
  loadConfig,
  loadLogo,
  getLastModifiedDate,
} = require('./js/configUtils.cjs');
const createLogger = require('./js/logger.cjs');
const AuthService = require('./js/authService.cjs');
const {
  fetchAnalysisIds,
  getDownloadLinks,
  listAvailableFiles,
  generateReport,
  metrics,
} = require('./js/fetchUtils.cjs');
const { downloadFile } = require('./js/fileUtils.cjs');
const {
  checkToolAvailability,
  ensureIndexFile,
  rangedDownloadBAM,
  rangedDownloadVCF,
  indexBAM,
  indexVCF,
  generateOutputFileName,
} = require('./js/rangedUtils.cjs');
// Rename the imported function to avoid collision.
const {
  resumeArchivedDownloads: resumeArchivedDownloadsFunc,
} = require('./js/archiveUtils.cjs');

// Command line arguments setup
const argv = yargs
  .usage('$0 <command> [args]')
  .version(false)
  .option('config', {
    alias: 'c',
    describe: 'Path to the configuration file',
    type: 'string',
    default: '.config.json',
  })
  .option('username', {
    alias: 'u',
    describe: 'Varvis API username',
    type: 'string',
  })
  .option('password', {
    alias: 'p',
    describe: 'Varvis API password',
    type: 'string',
  })
  .option('target', {
    alias: 't',
    describe: 'Target for the Varvis API',
    type: 'string',
  })
  .option('analysisIds', {
    alias: 'a',
    describe: 'Analysis IDs to download files for (comma-separated)',
    type: 'array',
  })
  .option('sampleIds', {
    alias: 's',
    describe: 'Sample IDs to filter analyses (comma-separated)',
    type: 'array',
  })
  .option('limsIds', {
    alias: 'l',
    describe: 'LIMS IDs to filter analyses (comma-separated)',
    type: 'array',
  })
  .option('list', {
    alias: 'L',
    describe: 'List available files for the specified analysis IDs',
    type: 'boolean',
  })
  .option('destination', {
    alias: 'd',
    describe: 'Destination folder for the downloaded files',
    type: 'string',
    default: '.',
  })
  .option('proxy', {
    alias: 'x',
    describe: 'Proxy URL',
    type: 'string',
  })
  .option('proxyUsername', {
    alias: 'pxu',
    describe: 'Proxy username',
    type: 'string',
  })
  .option('proxyPassword', {
    alias: 'pxp',
    describe: 'Proxy password',
    type: 'string',
  })
  .option('overwrite', {
    alias: 'o',
    describe: 'Overwrite existing files',
    type: 'boolean',
    default: false,
  })
  .option('filetypes', {
    alias: 'f',
    describe: 'File types to download (comma-separated)',
    type: 'array',
    default: ['bam', 'bam.bai'],
  })
  .option('loglevel', {
    alias: 'll',
    describe: 'Logging level (info, warn, error, debug)',
    type: 'string',
    default: 'info',
  })
  .option('logfile', {
    alias: 'lf',
    describe: 'Path to the log file',
    type: 'string',
  })
  .option('reportfile', {
    alias: 'r',
    describe: 'Path to the report file',
    type: 'string',
  })
  .option('filter', {
    alias: 'F',
    describe:
      'Filter expressions (e.g., "analysisType=SNV", "sampleId>LB24-0001")',
    type: 'array',
    default: [],
  })
  .option('range', {
    alias: 'g',
    describe: 'Genomic range for ranged download (e.g., chr1:1-100000)',
    type: 'string',
  })
  .option('bed', {
    alias: 'b',
    describe: 'Path to BED file containing multiple regions',
    type: 'string',
  })
  .option('restoreArchived', {
    alias: 'ra',
    describe:
      'Restore archived files. Accepts "no", "ask" (default), "all", or "force".',
    type: 'string',
    default: 'ask',
  })
  .option('restorationFile', {
    alias: 'rf',
    describe:
      'Path and name for the awaiting-restoration JSON file (default: "awaiting-restoration.json")',
    type: 'string',
    default: 'awaiting-restoration.json',
  })
  .option('resumeArchivedDownloads', {
    alias: 'rad',
    describe:
      'Resume downloads for archived files from the awaiting-restoration JSON file if restoreEstimation has passed.',
    type: 'boolean',
    default: false,
  })
  .option('list-urls', {
    alias: 'U',
    describe:
      'List the direct download URLs for the selected files instead of downloading them. Useful for piping to other tools.',
    type: 'boolean',
    default: false,
  })
  .option('url-file', {
    describe:
      'Path to a file to save the download URLs when using --list-urls.',
    type: 'string',
  })
  .option('version', {
    alias: 'v',
    type: 'boolean',
    description: 'Show version information',
    default: false,
  })
  .help()
  .alias('help', 'h').argv;

// Create logger instance
const logger = createLogger(argv);

// Show version information if the --version flag is set
if (argv.version) {
  const logo = loadLogo();
  console.log(logo);
  console.log(`${name} - Version ${version}`);
  console.log(`Date Last Modified: ${getLastModifiedDate(__filename)}`);
  console.log(`Author: ${author}`);
  console.log(`Repository: ${repository.url}`);
  console.log(`License: ${license}`);
  process.exit(0);
}

// Load configuration file settings
const configFilePath = path.resolve(argv.config);
const config = loadConfig(configFilePath);

// Merge command line arguments with configuration file settings
const finalConfig = {
  ...config,
  ...argv,
  filetypes: (() => {
    const rawFiletypes = argv.filetypes ||
      config.filetypes || ['bam', 'bam.bai'];
    // Handle comma-separated strings in array elements
    return rawFiletypes.flatMap((ft) =>
      typeof ft === 'string' && ft.includes(',')
        ? ft.split(',').map((s) => s.trim())
        : ft,
    );
  })(),
  analysisIds: (argv.analysisIds || config.analysisIds || []).filter(Boolean),
  sampleIds: (argv.sampleIds || config.sampleIds || []).filter(Boolean),
  limsIds: (argv.limsIds || config.limsIds || []).filter(Boolean),
  filters: (argv.filter || config.filter || []).map((filter) => filter.trim()),
  destination:
    argv.destination !== '.' ? argv.destination : config.destination || '.',
  restoreArchived: argv.restoreArchived || config.restoreArchived || 'ask',
  restorationFile:
    argv.restorationFile ||
    config.restorationFile ||
    'awaiting-restoration.json',
  resumeArchivedDownloads:
    argv.resumeArchivedDownloads || config.resumeArchivedDownloads || false,
  listUrls: argv.listUrls || config.listUrls || false,
  urlFile: argv.urlFile || config.urlFile || null,
};

// Validate the final configuration
const requiredFields = ['username', 'password', 'target'];
for (const field of requiredFields) {
  if (!finalConfig[field]) {
    logger.error(`Error: Missing required argument --${field}`);
    process.exit(1);
  }
}

// Ensure at least one of analysisIds, sampleIds, limsIds is provided unless resumeArchivedDownloads is set.
if (
  finalConfig.analysisIds.length === 0 &&
  finalConfig.sampleIds.length === 0 &&
  finalConfig.limsIds.length === 0 &&
  !finalConfig.resumeArchivedDownloads
) {
  logger.error(
    'Error: You must provide at least one of the following options: analysisIds (-a), sampleIds (-s), limsIds (-l), or set --resumeArchivedDownloads (rad) to process archived downloads.',
  );
  process.exit(1);
}

// Extract the final configuration values with environment variable priority
const target = finalConfig.target;
const userName = process.env.VARVIS_USER || finalConfig.username;
const password = process.env.VARVIS_PASSWORD || finalConfig.password;
const analysisIds = finalConfig.analysisIds;
const sampleIds = finalConfig.sampleIds;
const limsIds = finalConfig.limsIds;
const destination = finalConfig.destination;
const proxy = finalConfig.proxy;
const proxyUsername = finalConfig.proxyUsername;
const proxyPassword = finalConfig.proxyPassword;
const overwrite = finalConfig.overwrite;
const filetypes = finalConfig.filetypes;
const reportfile = finalConfig.reportfile;
const filters = finalConfig.filters;
const restoreArchived = finalConfig.restoreArchived;
const restorationFile = finalConfig.restorationFile;

// Setup HTTP agent for proxy and cookie handling
const jar = new CookieJar();
const agentOptions = proxy ? { uri: proxy } : {};
if (proxyUsername && proxyPassword) {
  agentOptions.auth = `${proxyUsername}:${proxyPassword}`;
}

const agent = proxy
  ? new ProxyAgent({
      ...agentOptions,
      factory: (origin, opts) =>
        new CookieClient(origin, {
          ...opts,
          cookies: { jar },
        }),
    })
  : new Agent({
      factory: (origin, opts) =>
        new CookieClient(origin, {
          ...opts,
          cookies: { jar },
        }),
    });

// Initialize AuthService instance
const authService = new AuthService(logger, agent);

// Initialize readline interface for user prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Handles the output of download URLs, printing to console and/or writing to a file.
 * @param {string[]} urls - An array of URL strings to output.
 * @param {string|null} filePath - The path to the output file, or null to only use console.
 * @param {Object} logger - The logger instance.
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
        `Failed to write URLs to file ${filePath}: ${error.message}`,
      );
    }
  }
}

// Main function to orchestrate the login and download process
const os = require('os'); // Import for generating temp file paths

async function main() {
  // If resumeArchivedDownloads flag is set, resume archived downloads and exit.
  if (finalConfig.resumeArchivedDownloads) {
    logger.info('Starting in archive resumption mode.');

    // Interactive password prompt if password is not available
    let finalPassword = password;
    if (!finalPassword) {
      const Mute = require('mute-stream');
      const mute = new Mute();
      mute.pipe(process.stdout);
      const rlWithMute = readline.createInterface({
        input: process.stdin,
        output: mute,
        terminal: true,
      });

      finalPassword = await new Promise((resolve) => {
        rlWithMute.question('Please enter your Varvis password: ', (input) => {
          resolve(input);
          rlWithMute.close();
          mute.end();
          // Print a newline since muted input doesn't show one
          process.stdout.write('\n');
        });
      });
    }

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

    // Interactive password prompt if password is not available
    let finalPassword = password;
    if (!finalPassword) {
      const Mute = require('mute-stream');
      const mute = new Mute();
      mute.pipe(process.stdout);
      const rlWithMute = readline.createInterface({
        input: process.stdin,
        output: mute,
        terminal: true,
      });

      finalPassword = await new Promise((resolve) => {
        rlWithMute.question('Please enter your Varvis password: ', (input) => {
          resolve(input);
          rlWithMute.close();
          mute.end();
          // Print a newline since muted input doesn't show one
          process.stdout.write('\n');
        });
      });
    }

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
    if (argv.range || argv.bed) {
      const samtoolsMinVersion = '1.17';
      const tabixMinVersion = '1.7';
      const bgzipMinVersion = '1.7';
      const samtoolsOK = await checkToolAvailability(
        'samtools',
        'samtools --version',
        samtoolsMinVersion,
        logger,
      );
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
      if (!samtoolsOK || !tabixOK || !bgzipOK) {
        logger.error(
          'One or more required external tools (samtools, tabix, bgzip) are missing or outdated. Please install/update them and try again.',
        );
        process.exit(1);
      }
    }

    // Handle regions from command line or BED file
    let regions = [];
    let tempBedPath; // Initialize tempBedPath

    if (argv.range) {
      regions = argv.range.split(' ');
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
    } else if (argv.bed) {
      try {
        const bedFileContent = fs.readFileSync(argv.bed, 'utf8');
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
        logger.error(`Error reading BED file: ${error.message}`);
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
          );
    logger.info(`Fetched analysis IDs: ${ids}`);

    // Create options object for restoration context
    const optionsForRestoration = {
      destination: finalConfig.destination,
      overwrite: finalConfig.overwrite,
      range: finalConfig.range,
      bed: finalConfig.bed,
      restorationFile: finalConfig.restorationFile,
      filetypes: filetypes, // Save filetypes for restoration
    };

    // Collect all URLs if --list-urls flag is set
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
        rl,
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

      for (const [fileName, file] of primaryFiles) {
        const downloadLink = file.downloadLink;

        // Generate the output file name for the current file
        const outputFile = path.join(
          destination,
          generateOutputFileName(fileName, regions, logger),
        );

        if (fileName.endsWith('.bam')) {
          // BAM file processing
          const indexFileUrl = fileDict[`${fileName}.bai`]?.downloadLink;
          const indexFilePath = path.join(destination, `${fileName}.bai`);

          if (regions.length > 0) {
            // For ranged downloads, index file is required
            if (!indexFileUrl) {
              logger.error(
                `Index file for BAM (${fileName}) not found. Ranged download requires .bai index. Skipping ranged download.`,
              );
              continue;
            }

            // Ensure index file is downloaded for ranged access
            await ensureIndexFile(
              downloadLink,
              indexFileUrl,
              indexFilePath,
              agent,
              rl,
              logger,
              metrics,
              overwrite,
            );

            // Perform ranged download using the temporary BED file
            try {
              logger.info(
                `Performing ranged download for BAM file: ${fileName}`,
              );
              await rangedDownloadBAM(
                downloadLink,
                tempBedPath,
                outputFile,
                indexFilePath,
                logger,
                metrics,
                overwrite,
              );
              await indexBAM(outputFile, logger, overwrite);
            } catch (error) {
              logger.error(
                `Error during ranged download for ${fileName}: ${error.message}`,
              );
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
                rl,
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
                    rl,
                    logger,
                    metrics,
                  );
                } catch (indexError) {
                  logger.warn(
                    `Failed to download index file ${fileName}.bai: ${indexError.message}`,
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
                `Error during full download for ${fileName}: ${error.message}`,
              );
            }
          }
        } else if (fileName.endsWith('.vcf.gz')) {
          // VCF file processing
          const indexFileUrl = fileDict[`${fileName}.tbi`]?.downloadLink;
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
              rl,
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
                  `Error during ranged download for ${fileName} on region ${region}: ${error.message}`,
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
                rl,
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
                    rl,
                    logger,
                    metrics,
                  );
                } catch (indexError) {
                  logger.warn(
                    `Failed to download index file ${fileName}.tbi: ${indexError.message}`,
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
                `Error during full download for ${fileName}: ${error.message}`,
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
    logger.error('An error occurred:', error.message);
    logger.debug(error.stack);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  logger.error('An unexpected error occurred:', error.message);
  logger.debug(error.stack);
  rl.close();
  process.exit(1);
});
