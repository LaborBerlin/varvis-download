const { spawn } = require('node:child_process');
const {
  createToolDiagnostic,
  redactToolText,
} = require('./download/toolDiagnostics.cjs');
const { getErrorMessage } = require('./errorUtils.cjs');

/**
 * Wraps spawn in a Promise to maintain async/await syntax.
 * @param   {string}                                 command       - The command to execute.
 * @param   {string[]}                               args          - The command arguments.
 * @param   {import('winston').Logger}               logger        - The logger instance.
 * @param   {boolean}                                captureOutput - Whether to capture stdout for return value.
 * @returns {Promise<import('./types').SpawnResult>}               - Resolves with result object when the process completes successfully.
 */
function spawnPromise(command, args, logger, captureOutput = false) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args);
    let stdout = '';
    const stderr = createToolDiagnostic();
    const stdoutDiagnostic = createToolDiagnostic();

    childProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (captureOutput) {
        stdout += output;
      }
      stdoutDiagnostic.append(output);
    });

    childProcess.stderr.on('data', (data) => {
      stderr.append(data);
    });

    childProcess.on('close', (code) => {
      if (stdoutDiagnostic.text())
        logger.debug(`[${command}] stdout: ${stdoutDiagnostic.text()}`);
      if (stderr.text()) logger.debug(`[${command}] stderr: ${stderr.text()}`);
      if (code === 0) {
        resolve(captureOutput ? { stdout } : {});
      } else {
        reject(
          new Error(
            `Process ${command} exited with code ${code}${stderr.text() ? `. Stderr: ${stderr.text()}` : ''}`,
          ),
        );
      }
    });

    childProcess.on('error', (err) => {
      reject(new Error(redactToolText(getErrorMessage(err))));
    });
  });
}

/**
 * Parses version string parts, extracting numeric prefixes from each segment.
 * Handles version suffixes like "1.18-rc1" by extracting just the numeric part.
 * @param   {string}   version - The version string to parse.
 * @returns {number[]}         - Array of numeric version parts.
 */
function parseVersionParts(version) {
  return version.split('.').map((part) => {
    const match = part.match(/^\d+/);
    return match ? Number(match[0]) : Number.NaN;
  });
}

/**
 * Compares two versions (e.g., '1.10' vs '1.9').
 * Handles version suffixes like "1.18-rc1" by extracting numeric prefixes.
 * @param   {string}  version    - The current version.
 * @param   {string}  minVersion - The minimum required version.
 * @returns {boolean}            - True if the current version is >= the minimum version, false if cannot compare.
 */
function compareVersions(version, minVersion) {
  const versionParts = parseVersionParts(version);
  const minVersionParts = parseVersionParts(minVersion);

  // If any part is not a valid number, we cannot compare reliably
  if (versionParts.some(Number.isNaN) || minVersionParts.some(Number.isNaN)) {
    return false;
  }

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
 * Retrieves the installed version string of an external tool.
 *
 * @param   {string}                   tool           - The name of the tool (samtools, tabix, or bgzip).
 * @param   {string}                   versionCommand - Command to check the tool version.
 * @param   {import('winston').Logger} logger         - The logger instance.
 * @returns {Promise<string|null>}                    - The tool version string, or null if detection failed.
 */
async function getToolVersion(tool, versionCommand, logger) {
  try {
    // parse the versionCommand to extract command and arguments
    const commandParts = versionCommand.split(/\s+/);
    const command = commandParts[0];
    const args = commandParts.slice(1);

    const { stdout } = /** @type {import('./types').CapturedSpawnResult} */ (
      await spawnPromise(command, args, logger, true)
    );
    const rawOutput = stdout.trim();
    const parts = rawOutput.split(/\s+/).filter(Boolean);

    if (parts.length < 2) {
      throw new Error(
        `Could not parse version from ${tool} output: "${rawOutput}"`,
      );
    }

    let toolVersion;
    // for tabix and bgzip, the second word is in parentheses, so the version is the third element
    if (parts[1].startsWith('(')) {
      if (parts.length < 3) {
        throw new Error(
          `Could not parse version from ${tool} output: "${rawOutput}"`,
        );
      }
      toolVersion = parts[2].trim();
    } else {
      toolVersion = parts[1].trim();
    }
    return toolVersion;
  } catch (error) {
    logger.error(`Error checking ${tool} version: ${getErrorMessage(error)}`);
    return null;
  }
}

/**
 * Checks if a tool is available and meets the minimum version.
 *
 * @param   {string}                   tool           - The name of the tool (samtools, tabix, or bgzip).
 * @param   {string}                   versionCommand - Command to check the tool version.
 * @param   {string}                   minVersion     - The minimal required version.
 * @param   {import('winston').Logger} logger         - The logger instance.
 * @returns {Promise<boolean>}                        - Resolves to true if the tool is available and meets the version requirement.
 */
async function checkToolAvailability(tool, versionCommand, minVersion, logger) {
  const toolVersion = await getToolVersion(tool, versionCommand, logger);
  if (!toolVersion) {
    return false;
  }

  // compare installed version against minimum required version
  if (compareVersions(toolVersion, minVersion)) {
    logger.info(`${tool} version ${toolVersion} is available.`);
    return true;
  }

  logger.error(
    `${tool} version ${toolVersion} is less than the required version ${minVersion}.`,
  );
  return false;
}

module.exports = {
  spawnPromise,
  compareVersions,
  getToolVersion,
  checkToolAvailability,
};
