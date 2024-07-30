#!/usr/bin/env node

const { CookieJar } = require('tough-cookie');
const { CookieClient } = require('http-cookie-agent/undici');
const yargs = require('yargs');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const { ProxyAgent, fetch, Agent } = require('undici');
const { version, name, author, license, repository } = require('./package.json'); // Import the version and name from package.json
const winston = require('winston');
const ProgressBar = require('progress'); // Import progress module

// Function to load configuration from a file
function loadConfig(configFilePath) {
  if (fs.existsSync(configFilePath)) {
    return JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
  }
  return {};
}

// Function to read the ASCII logo from the logo.txt file
function loadLogo() {
  const logoPath = path.resolve(__dirname, 'assets/logo.txt');
  if (fs.existsSync(logoPath)) {
    return fs.readFileSync(logoPath, 'utf-8');
  }
  return '';
}

function getLastModifiedDate(filePath) {
  const stats = fs.statSync(filePath);
  return stats.mtime.toISOString().split('T')[0];
}

const logo = loadLogo();

// Command line arguments setup
const argv = yargs
  .usage('$0 <command> [args]')
  .version(false) // Disable built-in version method
  .option('config', {
    alias: 'c',
    describe: 'Path to the configuration file',
    type: 'string',
    default: '.config.json'
  })
  .option('username', {
    alias: 'u',
    describe: 'Varvis API username',
    type: 'string'
  })
  .option('password', {
    alias: 'p',
    describe: 'Varvis API password',
    type: 'string'
  })
  .option('target', {
    alias: 't',
    describe: 'Target for the Varvis API',
    type: 'string'
  })
  .option('analysisIds', {
    alias: 'a',
    describe: 'Analysis IDs to download files for (comma-separated)',
    type: 'string'
  })
  .option('sampleIds', {
    alias: 's',
    describe: 'Sample IDs to filter analyses (comma-separated)',
    type: 'string'
  })
  .option('limsIds', {
    alias: 'l',
    describe: 'LIMS IDs to filter analyses (comma-separated)',
    type: 'string'
  })
  .option('list', {
    alias: 'L',
    describe: 'List available files for the specified analysis IDs',
    type: 'boolean'
  })
  .option('destination', {
    alias: 'd',
    describe: 'Destination folder for the downloaded files',
    type: 'string',
    default: '.'
  })
  .option('proxy', {
    alias: 'x',
    describe: 'Proxy URL',
    type: 'string'
  })
  .option('proxyUsername', {
    alias: 'pxu',
    describe: 'Proxy username',
    type: 'string'
  })
  .option('proxyPassword', {
    alias: 'pxp',
    describe: 'Proxy password',
    type: 'string'
  })
  .option('overwrite', {
    alias: 'o',
    describe: 'Overwrite existing files',
    type: 'boolean',
    default: false
  })
  .option('filetypes', {
    alias: 'f',
    describe: 'File types to download (comma-separated)',
    type: 'string',
    default: 'bam,bam.bai'
  })
  .option('loglevel', {
    alias: 'll',
    describe: 'Logging level (info, warn, error, debug)',
    type: 'string',
    default: 'info'
  })
  .option('logfile', {
    alias: 'lf',
    describe: 'Path to the log file',
    type: 'string'
  })
  .option('reportfile', {
    alias: 'r',
    describe: 'Path to the report file',
    type: 'string'
  })
  .option('version', {
    alias: 'v',
    type: 'boolean',
    description: 'Show version information',
    default: false
  })
  .help()
  .alias('help', 'h')
  .argv;

// Initialize logger
const transports = [
  new winston.transports.Console()
];

if (argv.logfile) {
  transports.push(new winston.transports.File({ filename: argv.logfile }));
}

const logger = winston.createLogger({
  level: argv.loglevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
  ),
  transports: transports
});

// Show version information
if (argv.version) {
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
  filetypes: (argv.filetypes || config.filetypes || 'bam,bam.bai').split(',').map(ft => ft.trim()),
  analysisIds: (argv.analysisIds || config.analysisIds || '').split(',').map(id => id.trim()).filter(id => id),
  sampleIds: (argv.sampleIds || config.sampleIds || '').split(',').map(id => id.trim()).filter(id => id),
  limsIds: (argv.limsIds || config.limsIds || '').split(',').map(id => id.trim()).filter(id => id),
  destination: argv.destination !== '.' ? argv.destination : (config.destination || '.')
};

// Validate the final configuration
const requiredFields = ['username', 'password', 'target'];
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

let token = '';

const jar = new CookieJar();
const agentOptions = proxy ? { uri: proxy } : {};
if (proxyUsername && proxyPassword) {
  agentOptions.auth = `${proxyUsername}:${proxyPassword}`;
}

const agent = proxy
  ? new ProxyAgent({
      ...agentOptions,
      factory: (origin, opts) => new CookieClient(origin, {
        ...opts,
        cookies: { jar },
      }),
    })
  : new Agent({
      factory: (origin, opts) => new CookieClient(origin, {
        ...opts,
        cookies: { jar },
      }),
    });

/**
 * AuthService class handles authentication with the Varvis API.
 */
class AuthService {
  /**
   * Fetches the CSRF token required for login.
   * @returns {Promise<string>} - The CSRF token.
   */
  async getCsrfToken() {
    try {
      logger.debug(`Fetching CSRF token from https://${target}.varvis.com/authenticate`);
      const response = await fetch(`https://${target}.varvis.com/authenticate`, {
        method: 'HEAD',
        dispatcher: agent
      });
      const csrfToken = response.headers.get('x-csrf-token');
      logger.debug(`Received CSRF token: ${csrfToken}`);
      return csrfToken;
    } catch (error) {
      logger.error('Error fetching initial CSRF token:', error);
      throw error;
    }
  }

  /**
   * Logs in to the Varvis API and retrieves the CSRF token.
   * @param {Object} user - The user credentials.
   * @param {string} user.username - The username.
   * @param {string} user.password - The password.
   * @returns {Promise<Object>} - The login response containing the CSRF token.
   */
  async login(user) {
    try {
      const csrfToken1 = await this.getCsrfToken();

      const params = new URLSearchParams();
      params.append('_csrf', csrfToken1);
      params.append('username', user.username);
      params.append('password', user.password);

      logger.debug(`Logging in to https://${target}.varvis.com/login with username: ${user.username}`);
      const loginResponse = await fetch(`https://${target}.varvis.com/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
        dispatcher: agent
      });

      if (loginResponse.status !== 200) {
        throw new Error('Login failed');
      }

      const csrfToken2Response = await fetch(`https://${target}.varvis.com/authenticate`, {
        method: 'HEAD',
        dispatcher: agent
      });

      token = csrfToken2Response.headers.get('x-csrf-token');

      logger.info('Login successful');
      return { csrfToken: token };
    } catch (error) {
      logger.error('Login error:', error);
      throw error;
    }
  }
}

const authService = new AuthService();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Prompts the user to confirm file overwrite if the file already exists.
 * @param {string} file - The file path.
 * @returns {Promise<boolean>} - True if the user confirms overwrite, otherwise false.
 */
async function confirmOverwrite(file) {
  return new Promise((resolve) => {
    rl.question(`File ${file} already exists. Overwrite? (y/n): `, (answer) => {
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Retries a fetch operation with a specified number of attempts.
 * @param {string} url - The URL to fetch.
 * @param {Object} options - The fetch options.
 * @param {number} retries - The number of retry attempts.
 * @returns {Promise<Response>} - The fetch response.
 */
async function fetchWithRetry(url, options, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`Fetch failed with status: ${response.status}`);
      return response;
    } catch (error) {
      if (attempt < retries) {
        logger.warn(`Fetch attempt ${attempt} failed. Retrying...`);
        await new Promise(res => setTimeout(res, attempt * 1000)); // Exponential backoff
      } else {
        logger.error(`Fetch failed after ${retries} attempts: ${error.message}`);
        throw error;
      }
    }
  }
}

/**
 * Fetches analysis IDs based on sampleIds or limsIds.
 * @returns {Promise<string[]>} - An array of analysis IDs.
 */
async function fetchAnalysisIds() {
  try {
    logger.debug('Fetching all analysis IDs');
    const response = await fetchWithRetry(`https://${target}.varvis.com/api/analyses`, {
      method: 'GET',
      headers: { 'x-csrf-token': token },
      dispatcher: agent
    });
    const data = await response.json();
    const analyses = data.response;

    // Filter out analyses of type "CNV"
    let filteredAnalyses = analyses.filter(analysis => analysis.analysisType !== 'CNV');

    if (sampleIds.length > 0) {
      logger.debug(`Filtering analyses by sampleIds: ${sampleIds.join(', ')}`);
      filteredAnalyses = filteredAnalyses.filter(analysis => sampleIds.includes(analysis.sampleId));
    }

    if (limsIds.length > 0) {
      logger.debug(`Filtering analyses by limsIds: ${limsIds.join(', ')}`);
      filteredAnalyses = filteredAnalyses.filter(analysis => limsIds.includes(analysis.personLimsId));
    }

    const ids = filteredAnalyses.map(analysis => analysis.id.toString());
    logger.debug(`Filtered analysis IDs: ${ids.join(', ')}`);
    return ids;
  } catch (error) {
    logger.error('Error fetching analysis IDs:', error);
    throw error;
  }
}

/**
 * Fetches the download links for specified file types from the Varvis API.
 * @param {string} analysisId - The analysis ID to fetch download links for.
 * @param {Array<string>} [filter] - An optional array of file types to filter by.
 * @returns {Promise<Object>} - An object containing the download links for the specified file types.
 */
async function getDownloadLinks(analysisId, filter = null) {
  try {
    logger.debug(`Fetching download links for analysis ID: ${analysisId}`);
    const response = await fetchWithRetry(`https://${target}.varvis.com/api/analysis/${analysisId}/get-file-download-links`, {
      method: 'GET',
      headers: { 'x-csrf-token': token },
      dispatcher: agent
    });
    const data = await response.json();
    const apiFileLinks = data.response.apiFileLinks;

    const fileDict = {};
    for (const file of apiFileLinks) {
      const fileNameParts = file.fileName.split('.');
      const fileType = fileNameParts.length > 2 ? fileNameParts.slice(-2).join('.') : fileNameParts.pop();
      logger.debug(`Checking file type: ${fileType}`);
      if (!filter || filter.includes(fileType)) {
        fileDict[file.fileName] = file;
      }
    }

    // Warn if requested file types are not available
    if (filter) {
      const availableFileTypes = Object.keys(fileDict).map(fileName => {
        const parts = fileName.split('.');
        return parts.length > 2 ? parts.slice(-2).join('.') : parts.pop();
      });
      logger.debug(`Available file types: ${availableFileTypes.join(', ')}`);
      const missingFileTypes = filter.filter(ft => !availableFileTypes.includes(ft));
      if (missingFileTypes.length > 0) {
        logger.warn(`Warning: The following requested file types are not available for the analysis ${analysisId}: ${missingFileTypes.join(', ')}`);
      }
    }
    return fileDict;
  } catch (error) {
    logger.error(`Failed to get download links for analysis ID ${analysisId}:`, error.message);
    process.exit(1);
  }
}

/**
 * Lists available files for the specified analysis IDs.
 * @param {string} analysisId - The analysis ID to list files for.
 * @returns {Promise<void>}
 */
async function listAvailableFiles(analysisId) {
  try {
    logger.info(`Listing available files for analysis ID: ${analysisId}`);
    const fileDict = await getDownloadLinks(analysisId);

    if (Object.keys(fileDict).length === 0) {
      logger.info('No files available for the specified analysis ID.');
    } else {
      logger.info('Available files:');
      for (const fileName of Object.keys(fileDict)) {
        logger.info(`- ${fileName}`);
      }
    }
  } catch (error) {
    logger.error(`Failed to list available files for analysis ID ${analysisId}:`, error.message);
  }
}

/**
 * Downloads a file from the given URL to the specified output path with progress reporting.
 * @param {string} url - The URL of the file to download.
 * @param {string} outputPath - The path where the file should be saved.
 * @returns {Promise<void>}
 */
async function downloadFile(url, outputPath) {
  logger.debug(`Starting download for: ${url}`);
  if (fs.existsSync(outputPath) && !overwrite) {
    const confirm = await confirmOverwrite(outputPath);
    if (!confirm) {
      logger.info(`Skipped downloading ${outputPath}`);
      return;
    }
  }

  const writer = fs.createWriteStream(outputPath);
  const response = await fetchWithRetry(url, { method: 'GET', dispatcher: agent });

  const startTime = Date.now();
  let totalBytes = 0;

  // Get the total size of the file for progress reporting
  const totalSize = parseInt(response.headers.get('content-length'), 10);
  const progressBar = new ProgressBar('  downloading [:bar] :rate/bps :percent :etas', {
    complete: '=',
    incomplete: ' ',
    width: 20,
    total: totalSize
  });

  try {
    for await (const chunk of response.body) {
      totalBytes += chunk.length;
      writer.write(chunk);
      progressBar.tick(chunk.length);
    }
    writer.end();

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // in seconds
    const speed = totalBytes / duration; // bytes per second

    await new Promise((resolve, reject) => {
      writer.on('finish', () => {
        logger.info(`Successfully downloaded ${outputPath}`);
        metrics.totalFilesDownloaded += 1;
        metrics.totalBytesDownloaded += totalBytes;
        metrics.downloadSpeeds.push(speed);
        resolve();
      });
      writer.on('error', (error) => {
        logger.error(`Failed to download ${outputPath}: ${error.message}`);
        reject(error);
      });
    });
  } catch (error) {
    logger.error(`Download interrupted for ${outputPath}: ${error.message}`);
    fs.unlinkSync(outputPath); // Clean up partial download
    throw error;
  }
}

/**
 * Generates a summary report of the download process.
 */
function generateReport() {
  const totalTime = (Date.now() - metrics.startTime) / 1000; // in seconds
  const averageSpeed = metrics.downloadSpeeds.reduce((a, b) => a + b, 0) / metrics.downloadSpeeds.length;

  const report = `
    Download Summary Report:
    ------------------------
    Total Files Downloaded: ${metrics.totalFilesDownloaded}
    Total Bytes Downloaded: ${metrics.totalBytesDownloaded}
    Average Download Speed: ${averageSpeed.toFixed(2)} bytes/sec
    Total Time Taken: ${totalTime.toFixed(2)} seconds
  `;

  logger.info(report);

  if (reportfile) {
    fs.writeFileSync(reportfile, report);
    logger.info(`Report written to ${reportfile}`);
  }
}

const metrics = {
  startTime: Date.now(),
  totalFilesDownloaded: 0,
  totalBytesDownloaded: 0,
  downloadSpeeds: []
};

/**
 * Main function to orchestrate the login and download process.
 * @returns {Promise<void>}
 */
async function main() {
  // Ensure the destination directory exists
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }

  try {
    await authService.login({ username: userName, password: password });

    const ids = analysisIds.length > 0 ? analysisIds : await fetchAnalysisIds();

    if (argv.list) {
      for (const analysisId of ids) {
        await listAvailableFiles(analysisId);
      }
    } else {
      for (const analysisId of ids) {
        const fileDict = await getDownloadLinks(analysisId, filetypes);

        for (const [fileName, file] of Object.entries(fileDict)) {
          const downloadLink = file.downloadLink;
          logger.info(`Downloading ${fileName} file for analysis ID ${analysisId}...`);
          await downloadFile(downloadLink, path.join(destination, fileName));
        }
      }

      logger.info('Download complete.');
      generateReport();
    }
  } catch (error) {
    logger.error('An error occurred:', error.message);
  } finally {
    rl.close();
    process.exit(1);
  }
}

main().catch(error => {
  logger.error('An unexpected error occurred:', error.message);
  rl.close();
  process.exit(1);
});
