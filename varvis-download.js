#!/usr/bin/env node

const { CookieJar } = require("tough-cookie");
const { CookieClient } = require("http-cookie-agent/undici");
const yargs = require("yargs");
const fs = require("fs"); // Import the fs module
const path = require("path");
const readline = require("readline");
const { ProxyAgent, Agent } = require("undici");
const {
  version,
  name,
  author,
  license,
  repository,
} = require("./package.json");

const {
  loadConfig,
  loadLogo,
  getLastModifiedDate,
} = require("./js/configUtils");
const createLogger = require("./js/logger");
const AuthService = require("./js/authService");
const {
  fetchAnalysisIds,
  getDownloadLinks,
  listAvailableFiles,
  generateReport,
  metrics,
} = require("./js/fetchUtils");
const { downloadFile } = require("./js/fileUtils");
const {
  checkToolAvailability,
  ensureIndexFile,
  rangedDownloadBAM,
  indexBAM,
  generateOutputFileName,
} = require("./js/rangedUtils");
// Rename the imported function to avoid collision.
const { resumeArchivedDownloads: resumeArchivedDownloadsFunc } = require("./js/archiveUtils");

// Command line arguments setup
const argv = yargs
  .usage("$0 <command> [args]")
  .version(false)
  .option("config", {
    alias: "c",
    describe: "Path to the configuration file",
    type: "string",
    default: ".config.json",
  })
  .option("username", {
    alias: "u",
    describe: "Varvis API username",
    type: "string",
  })
  .option("password", {
    alias: "p",
    describe: "Varvis API password",
    type: "string",
  })
  .option("target", {
    alias: "t",
    describe: "Target for the Varvis API",
    type: "string",
  })
  .option("analysisIds", {
    alias: "a",
    describe: "Analysis IDs to download files for (comma-separated)",
    type: "string",
  })
  .option("sampleIds", {
    alias: "s",
    describe: "Sample IDs to filter analyses (comma-separated)",
    type: "string",
  })
  .option("limsIds", {
    alias: "l",
    describe: "LIMS IDs to filter analyses (comma-separated)",
    type: "string",
  })
  .option("list", {
    alias: "L",
    describe: "List available files for the specified analysis IDs",
    type: "boolean",
  })
  .option("destination", {
    alias: "d",
    describe: "Destination folder for the downloaded files",
    type: "string",
    default: ".",
  })
  .option("proxy", {
    alias: "x",
    describe: "Proxy URL",
    type: "string",
  })
  .option("proxyUsername", {
    alias: "pxu",
    describe: "Proxy username",
    type: "string",
  })
  .option("proxyPassword", {
    alias: "pxp",
    describe: "Proxy password",
    type: "string",
  })
  .option("overwrite", {
    alias: "o",
    describe: "Overwrite existing files",
    type: "boolean",
    default: false,
  })
  .option("filetypes", {
    alias: "f",
    describe: "File types to download (comma-separated)",
    type: "string",
    default: "bam,bam.bai",
  })
  .option("loglevel", {
    alias: "ll",
    describe: "Logging level (info, warn, error, debug)",
    type: "string",
    default: "info",
  })
  .option("logfile", {
    alias: "lf",
    describe: "Path to the log file",
    type: "string",
  })
  .option("reportfile", {
    alias: "r",
    describe: "Path to the report file",
    type: "string",
  })
  .option("filter", {
    alias: "F",
    describe:
      'Filter expressions (e.g., "analysisType=SNV", "sampleId>LB24-0001")',
    type: "array",
    default: [],
  })
  .option("range", {
    alias: "g",
    describe: "Genomic range for ranged download (e.g., chr1:1-100000)",
    type: "string",
  })
  .option("bed", {
    alias: "b",
    describe: "Path to BED file containing multiple regions",
    type: "string",
  })
  .option("restoreArchived", {
    alias: "ra",
    describe:
      'Restore archived files. Accepts "ask" (default) to prompt for each file or "all" to restore all archived files automatically.',
    type: "string",
    default: "ask",
  })
  .option("restorationFile", {
    alias: "rf",
    describe:
      'Path and name for the awaiting-restoration JSON file (default: "awaiting-restoration.json")',
    type: "string",
    default: "awaiting-restoration.json",
  })
  .option("resumeArchivedDownloads", {
    alias: "rad",
    describe:
      "Resume downloads for archived files from the awaiting-restoration JSON file if restoreEstimation has passed.",
    type: "boolean",
    default: false,
  })
  .option("version", {
    alias: "v",
    type: "boolean",
    description: "Show version information",
    default: false,
  })
  .help()
  .alias("help", "h").argv;

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
  filetypes: (argv.filetypes || config.filetypes || "bam,bam.bai")
    .split(",")
    .map((ft) => ft.trim()),
  analysisIds: (argv.analysisIds || config.analysisIds || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id),
  sampleIds: (argv.sampleIds || config.sampleIds || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id),
  limsIds: (typeof argv.limsIds === "string"
    ? argv.limsIds
    : config.limsIds || ""
  )
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id),
  filters: (argv.filter || config.filter || []).map((filter) => filter.trim()),
  destination:
    argv.destination !== "." ? argv.destination : config.destination || ".",
  restoreArchived: argv.restoreArchived || config.restoreArchived || "ask",
  restorationFile:
    argv.restorationFile || config.restorationFile || "awaiting-restoration.json",
  resumeArchivedDownloads:
    argv.resumeArchivedDownloads ||
    config.resumeArchivedDownloads ||
    false,
};

// Validate the final configuration
const requiredFields = ["username", "password", "target"];
for (const field of requiredFields) {
  if (!finalConfig[field]) {
    logger.error(`Error: Missing required argument --${field}`);
    process.exit(1);
  }
}

// Extract the final configuration values
const target = finalConfig.target;
const userName = finalConfig.username;
const password = finalConfig.password;
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
const resumeArchivedDownloads = finalConfig.resumeArchivedDownloads;

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

// Main function to orchestrate the login and download process
const os = require("os"); // Import for generating temp file paths

async function main() {
  // If resumeArchivedDownloads flag is set, resume archived downloads and exit.
  if (finalConfig.resumeArchivedDownloads) {
    logger.info("Resuming archived downloads as requested.");
    await resumeArchivedDownloadsFunc(
      restorationFile,
      destination,
      target,
      authService.token,
      agent,
      logger,
      overwrite
    );
    process.exit(0);
  }

  try {
    logger.debug("Starting main function");

    // Ensure the destination directory exists
    if (!fs.existsSync(destination)) {
      logger.debug(`Creating destination directory: ${destination}`);
      fs.mkdirSync(destination, { recursive: true });
    }

    logger.debug("Attempting to log in");
    await authService.login({ username: userName, password: password }, target);
    logger.debug("Login successful");

    // Handle regions from command line or BED file
    let regions = [];
    let tempBedPath; // Initialize tempBedPath

    if (argv.range) {
      regions = argv.range.split(" ");
      logger.info(`Using regions from command line: ${regions}`);

      // Create a temporary BED file for samtools to read
      tempBedPath = path.join(os.tmpdir(), "regions.bed");
      const bedContent = regions
        .map((region) => {
          const [chr, pos] = region.split(":");
          const [start, end] = pos.split("-");
          return `${chr}\t${start}\t${end}`;
        })
        .join("\n");

      fs.writeFileSync(tempBedPath, bedContent);
      logger.info(`Generated temporary BED file: ${tempBedPath}`);
    } else if (argv.bed) {
      try {
        const bedFileContent = fs.readFileSync(argv.bed, "utf8");
        regions = bedFileContent
          .split("\n")
          .filter((line) => line && !line.startsWith("#")) // Filter out comments and empty lines
          .map((line) => {
            const [chr, start, end] = line.split("\t");
            return `${chr}:${start}-${end}`;
          });
        logger.info(`Using regions from BED file: ${regions}`);

        // Create a temporary BED file for samtools to read
        tempBedPath = path.join(os.tmpdir(), "regions.bed");
        fs.writeFileSync(tempBedPath, bedFileContent);
        logger.info(`Generated temporary BED file: ${tempBedPath}`);
      } catch (error) {
        logger.error(`Error reading BED file: ${error.message}`);
        process.exit(1);
      }
    } else {
      logger.info("No regions provided. Proceeding with full file download.");
    }

    // Generate output file name using the function based on regions
    const outputFile = path.join(
      destination,
      generateOutputFileName("download.bam", regions, logger)
    );
    logger.info(`Output file: ${outputFile}`);

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
            logger
          );
    logger.info(`Fetched analysis IDs: ${ids}`);

    for (const analysisId of ids) {
      logger.info(`Processing analysis ID: ${analysisId}`);
      // Pass the restoreArchived flag, rl, and restorationFile to getDownloadLinks
      const fileDict = await getDownloadLinks(
        analysisId,
        filetypes,
        target,
        authService.token,
        agent,
        logger,
        restoreArchived,
        rl,
        restorationFile
      );
      logger.debug(`Fetched download links for analysis ID ${analysisId}`);

      for (const [fileName, file] of Object.entries(fileDict)) {
        const downloadLink = file.downloadLink;
        const indexFileUrl = fileDict[`${fileName}.bai`]?.downloadLink;
        const indexFilePath = path.join(destination, `${fileName}.bai`);

        if (!indexFileUrl) {
          logger.error(`Index file for BAM (${fileName}) not found.`);
          continue;
        }

        // Ensure index file is downloaded
        await ensureIndexFile(
          downloadLink,
          indexFileUrl,
          indexFilePath,
          agent,
          rl,
          logger,
          metrics,
          overwrite
        );

        // Generate the output file name for the current file
        const outputFile = path.join(
          destination,
          generateOutputFileName(fileName, regions, logger)
        );

        if (regions.length > 0) {
          // Perform ranged download using the temporary BED file
          try {
            logger.info(`Performing ranged download for file: ${fileName}`);
            await rangedDownloadBAM(
              downloadLink,
              tempBedPath,
              outputFile,
              indexFilePath,
              logger,
              overwrite
            );
            await indexBAM(outputFile, logger, overwrite);
          } catch (error) {
            logger.error(
              `Error during ranged download for ${fileName}: ${error.message}`
            );
          }
        } else {
          // Perform full download
          try {
            logger.info(`Performing full download for file: ${fileName}`);
            await downloadFile(
              downloadLink,
              outputFile,
              overwrite,
              agent,
              rl,
              logger,
              metrics
            );
            await indexBAM(outputFile, logger, overwrite);
          } catch (error) {
            logger.error(
              `Error during full download for ${fileName}: ${error.message}`
            );
          }
        }
      }
    }

    logger.info("Download complete.");
    generateReport(reportfile, logger);

    // Clean up the temporary BED file if it was created
    if (tempBedPath) {
      fs.unlinkSync(tempBedPath);
      logger.info(`Deleted temporary BED file: ${tempBedPath}`);
    }
  } catch (error) {
    logger.error("An error occurred:", error.message);
    logger.debug(error.stack);
  } finally {
    rl.close();
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error("An unexpected error occurred:", error.message);
  logger.debug(error.stack);
  rl.close();
  process.exit(1);
});
