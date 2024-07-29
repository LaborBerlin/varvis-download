#!/usr/bin/env node

const { CookieJar } = require('tough-cookie');
const { CookieClient } = require('http-cookie-agent/undici');
const yargs = require('yargs');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { ProxyAgent, fetch } = require('undici');
const { version } = require('./package.json'); // Import the version from package.json

// Command line arguments setup
const argv = yargs
  .usage('$0 <command> [args]')
  .version(version) // Use the built-in yargs version method
  .option('username', {
    alias: 'u',
    describe: 'Varvis API username',
    type: 'string',
    demandOption: true,
  })
  .option('password', {
    alias: 'p',
    describe: 'Varvis API password',
    type: 'string',
    demandOption: true,
  })
  .option('target', {
    alias: 't',
    describe: 'Target for the Varvis API',
    type: 'string',
    demandOption: true,
  })
  .option('analysisId', {
    alias: 'a',
    describe: 'Analysis ID to download files for',
    type: 'string',
    demandOption: true,
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
  .option('overwrite', {
    alias: 'o',
    describe: 'Overwrite existing files',
    type: 'boolean',
    default: false,
  })
  .help()
  .alias('help', 'h')
  .argv;

// Extract the command line arguments
const target = argv.target;
const userName = argv.username;
const password = argv.password;
const analysisId = argv.analysisId;
const destination = argv.destination;
const proxy = argv.proxy;
const overwrite = argv.overwrite;

let token = '';

const jar = new CookieJar();
const agentOptions = proxy ? {
  uri: proxy,
  factory: (origin, opts) => new CookieClient(origin, {
    ...opts,
    cookies: { jar },
  }),
} : {
  factory: (origin, opts) => new CookieClient(origin, {
    ...opts,
    cookies: { jar },
  }),
};
const agent = new ProxyAgent(agentOptions);

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
      console.error('Error fetching initial CSRF token:', error);
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

      return { csrfToken: token };
    } catch (error) {
      console.error('Login error:', error);
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
 * Fetches the download links for BAM and BAI files from the Varvis API.
 * @returns {Promise<Object>} - An object containing the download links for BAM and BAI files.
 */
async function getDownloadLinks() {
  try {
    const response = await fetch(`https://${target}.varvis.com/api/analysis/${analysisId}/get-file-download-links`, {
      method: 'GET',
      headers: { 'x-csrf-token': token },
      dispatcher: agent
    });
    const data = await response.json();
    const apiFileLinks = data.response.apiFileLinks;

    const bamBaiDict = {};
    for (const file of apiFileLinks) {
      if (file.fileName.endsWith('.bam')) {
        bamBaiDict['bam'] = file;
      } else if (file.fileName.endsWith('.bam.bai')) {
        bamBaiDict['bai'] = file;
      }
    }
    return bamBaiDict;
  } catch (error) {
    console.error('Failed to get download links:', error.message);
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
      console.log(`Skipped downloading ${outputPath}`);
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
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

/**
 * Main function to orchestrate the login and download process.
 * @returns {Promise<void>}
 */
async function main() {
  await authService.login({ username: userName, password: password });
  const bamBaiDict = await getDownloadLinks();

  const bamFile = bamBaiDict.bam.fileName;
  const bamLink = bamBaiDict.bam.downloadLink;
  const baiFile = bamBaiDict.bai.fileName;
  const baiLink = bamBaiDict.bai.downloadLink;

  console.log('Downloading BAI file...');
  await downloadFile(baiLink, path.join(destination, baiFile));
  console.log('Downloading BAM file...');
  await downloadFile(bamLink, path.join(destination, bamFile));

  console.log('Download complete.');
  rl.close();
}

main().catch(error => {
  console.error('An error occurred:', error.message);
  rl.close();
  process.exit(1);
});
