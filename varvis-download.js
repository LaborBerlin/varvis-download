#!/usr/bin/env node

const { CookieJar } = require('tough-cookie');
const { CookieClient } = require('http-cookie-agent/undici');
const yargs = require('yargs');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { ProxyAgent, fetch, Agent } = require('undici');
const { version } = require('./package.json'); // Import the version from package.json
const winston = require('winston');

// Function to load configuration from a file
function loadConfig(configFilePath) {
  if (fs.existsSync(configFilePath)) {
    return JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
  }
  return {};
}

// Command line arguments setup
const argv = yargs
  .usage('$0 <command> [args]')
  .version(version) // Use the built-in yargs version method
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
    type: 'string',
    demandOption: true
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
    alias: 'l',
    describe: 'Logging level (info, warn, error, debug)',
    type: 'string',
    default: 'info'
  })
  .option('logfile', {
    alias: 'lf',
    describe: 'Path to the log file',
    type: 'string'
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

// Load configuration file settings
const configFilePath = path.resolve(argv.config);
const config = loadConfig(configFilePath);

// Merge command line arguments with configuration file settings
const finalConfig = {
  ...config,
  ...argv,
  filetypes: (argv.filetypes || config.filetypes || 'bam,bam.bai').split(',').map(ft => ft.trim()),
  analysisIds: (argv.analysisIds || config.analysisIds || '').split(',').map(id => id.trim()),
  destination: argv.destination !== '.' ? argv.destination : (config.destination || '.')
};

// Validate the final configuration
const requiredFields = ['username', 'password', 'target', 'analysisIds'];
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
const destination = finalConfig.destination;
const proxy = finalConfig.proxy;
const overwrite = finalConfig.overwrite;
const filetypes = finalConfig.filetypes;

let token = '';

const jar = new CookieJar();
const agent = proxy 
  ? new ProxyAgent({
      uri: proxy,
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
      const response = await fetch(`https://${target}.varvis.com/authenticate`, {
        method: 'HEAD',
        dispatcher: agent
      });
      const csrfToken = response.headers.get('x-csrf-token');
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
 * Fetches the download links for specified file types from the Varvis API.
 * @param {string} analysisId - The analysis ID to fetch download links for.
 * @returns {Promise<Object>} - An object containing the download links for the specified file types.
 */
async function getDownloadLinks(analysisId) {
  try {
    const response = await fetch(`https://${target}.varvis.com/api/analysis/${analysisId}/get-file-download-links`, {
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
      if (filetypes.includes(fileType)) {
        fileDict[file.fileName] = file;
      }
    }

    // Warn if requested file types are not available
    const availableFileTypes = Object.keys(fileDict).map(fileName => {
      const parts = fileName.split('.');
      return parts.length > 2 ? parts.slice(-2).join('.') : parts.pop();
    });
    const missingFileTypes = filetypes.filter(ft => !availableFileTypes.includes(ft));
    if (missingFileTypes.length > 0) {
      logger.warn(`Warning: The following requested file types are not available for the analysis ${analysisId}: ${missingFileTypes.join(', ')}`);
    }

    return fileDict;
  } catch (error) {
    logger.error(`Failed to get download links for analysis ID ${analysisId}:`, error.message);
    process.exit(1);
  }
}

/**
 * Downloads a file from the given URL to the specified output path.
 * @param {string} url - The URL of the file to download.
 * @param {string} outputPath - The path where the file should be saved.
 * @returns {Promise<void>}
 */
async function downloadFile(url, outputPath) {
  if (fs.existsSync(outputPath) && !overwrite) {
    const confirm = await confirmOverwrite(outputPath);
    if (!confirm) {
      logger.info(`Skipped downloading ${outputPath}`);
      return;
    }
  }

  const writer = fs.createWriteStream(outputPath);
  const response = await fetch(url, {
    method: 'GET',
    dispatcher: agent
  });

  for await (const chunk of response.body) {
    writer.write(chunk);
  }

  writer.end();

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      logger.info(`Successfully downloaded ${outputPath}`);
      resolve();
    });
    writer.on('error', (error) => {
      logger.error(`Failed to download ${outputPath}: ${error.message}`);
      reject(error);
    });
  });
}

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

    for (const analysisId of analysisIds) {
      const fileDict = await getDownloadLinks(analysisId);

      for (const [fileName, file] of Object.entries(fileDict)) {
        const downloadLink = file.downloadLink;
        logger.info(`Downloading ${fileName} file for analysis ID ${analysisId}...`);
        await downloadFile(downloadLink, path.join(destination, fileName));
      }
    }

    logger.info('Download complete.');
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
