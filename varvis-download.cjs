#!/usr/bin/env node

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const readline = require('node:readline');
const { hideBin } = require('yargs/helpers');
const {
  author,
  license,
  name,
  repository,
  version,
} = require('./package.json');

const AuthService = require('./js/authService.cjs');
const { parseArguments } = require('./js/cli/args.cjs');
const { mergeFromArgv } = require('./js/cli/configMerge.cjs');
const { formatVersionInfo } = require('./js/cli/versionInfo.cjs');
const { runDownloadCommand } = require('./js/commands/download.cjs');
const { runListCommand } = require('./js/commands/list.cjs');
const { resumeArchivedDownloads } = require('./js/commands/resume.cjs');
const { loadLogo, getLastModifiedDate } = require('./js/configUtils.cjs');
const { ConfigurationError, OperationalError } = require('./js/errors.cjs');
const { getErrorMessage, getErrorStack } = require('./js/errorUtils.cjs');
const { metrics } = require('./js/fetchUtils.cjs');
const { parseRegions } = require('./js/io/regionParsing.cjs');
const { promptForPassword } = require('./js/io/passwordPrompt.cjs');
const createLogger = require('./js/logger.cjs');
const { createHttpAgent } = require('./js/net/httpAgent.cjs');

/** @type {import('winston').Logger|undefined} */
let activeLogger;

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

/**
 * Runs the varvis-download CLI.
 * @returns {Promise<void>}
 */
async function main() {
  /** @type {any} */
  const argv = parseArguments(hideBin(process.argv));
  activeLogger = createLogger(argv);

  if (argv.version) {
    console.log(
      formatVersionInfo({
        author,
        license,
        logo: loadLogo(),
        lastModified: getLastModifiedDate(__filename),
        name,
        repository,
        version,
      }),
    );
    return;
  }

  const finalConfig = mergeFromArgv(argv, process.env);
  if (finalConfig.overwriteFromConfig) {
    activeLogger.warn(
      'overwrite enabled via config file; existing files may be replaced.',
    );
  }
  const agent = createHttpAgent({
    proxy: finalConfig.proxy,
    proxyPassword: finalConfig.proxyPassword,
    proxyUsername: finalConfig.proxyUsername,
  });

  try {
    const authService = new AuthService(activeLogger, agent);

    // Non-resume mode validates/creates the destination before authenticating,
    // so an unusable --destination fails fast without a network round-trip.
    if (
      !finalConfig.resumeArchivedDownloads &&
      !fs.existsSync(finalConfig.destination)
    ) {
      activeLogger.debug(
        `Creating destination directory: ${finalConfig.destination}`,
      );
      fs.mkdirSync(finalConfig.destination, { recursive: true });
    }

    const password = await resolvePassword(finalConfig.password);
    await authService.login(
      { username: finalConfig.username, password },
      finalConfig.target,
    );

    if (finalConfig.resumeArchivedDownloads) {
      activeLogger.info('Starting in archive resumption mode.');
      activeLogger.info('Resuming archived downloads as requested.');
      await resumeArchivedDownloads(
        finalConfig.restorationFile,
        finalConfig.destination,
        finalConfig.target,
        authService.token,
        agent,
        activeLogger,
        finalConfig.overwrite,
      );
      activeLogger.info('Archive resumption process complete.');
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const deps = {
        agent,
        authService,
        logger: activeLogger,
        metrics,
        rl,
      };

      if (finalConfig.list) {
        await runListCommand({ finalConfig }, deps);
        return;
      }

      const { regions, tempBedPath } = parseRegions(
        { bed: finalConfig.bed, range: finalConfig.range },
        activeLogger,
      );
      await runDownloadCommand({ finalConfig, regions, tempBedPath }, deps);

      if (tempBedPath) {
        fs.unlinkSync(tempBedPath);
        activeLogger.info(`Deleted temporary BED file: ${tempBedPath}`);
      }
    } finally {
      rl.close();
    }
  } finally {
    // Release keep-alive sockets so the CLI exits promptly on completion.
    await agent.close().catch(() => {});
  }
}

main().catch((error) => {
  const logger = activeLogger || createLogger({});
  if (
    error instanceof ConfigurationError ||
    error instanceof OperationalError
  ) {
    logger.error(`Error: ${error.message}`);
    process.exit(error.exitCode || 1);
  }

  logger.error(`An unexpected error occurred: ${getErrorMessage(error)}`);
  const stack = getErrorStack(error);
  if (stack) {
    logger.debug(stack);
  }
  process.exit(1);
});
