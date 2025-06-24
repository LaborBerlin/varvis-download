const { exec } = require('child_process');
const path = require('path');

const cliPath = path.resolve(__dirname, '../../../varvis-download.cjs');

/**
 * Executes the CLI tool as a child process.
 * @param {string} args - Command-line arguments to pass to the CLI.
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
function runCli(args) {
  return new Promise((resolve) => {
    exec(`node ${cliPath} ${args}`, (error, stdout, stderr) => {
      resolve({
        code: error ? error.code : 0,
        stdout,
        stderr,
      });
    });
  });
}

module.exports = { runCli };
