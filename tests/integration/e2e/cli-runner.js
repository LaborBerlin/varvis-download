const { execFile } = require('node:child_process');
const path = require('node:path');

const cliPath = path.resolve(__dirname, '../../../varvis-download.cjs');

/**
 * Executes the CLI tool as a child process.
 * @param {string[]} args - Command-line arguments to pass to the CLI.
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
function runCli(args) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [cliPath, ...args],
      {
        env: {
          ...process.env,
          VARVIS_USER: process.env.VARVIS_PLAYGROUND_USER,
          VARVIS_PASSWORD: process.env.VARVIS_PLAYGROUND_PASS,
          VARVIS_TARGET: 'playground',
        },
        timeout: 180000,
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        resolve({
          code: error ? error.code : 0,
          stdout,
          stderr,
        });
      },
    );
  });
}

module.exports = { runCli };
