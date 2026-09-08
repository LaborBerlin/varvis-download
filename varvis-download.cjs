#!/usr/bin/env node

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const readline = require('node:readline');
const nodeModule = process.getBuiltinModule('node:module');
const hostCreateRequire =
  Object.getPrototypeOf(nodeModule)?.createRequire || nodeModule.createRequire;

// yargs ships ESM-only ("yargs/helpers" has no "require" export condition).
// A plain require() here would go through Jest's instrumented module loader,
// which cannot load ESM; a require created via createRequire() uses Node's
// native loader instead, so it can (see js/cli/args.cjs for the same pattern).
const nativeRequire = hostCreateRequire(__filename);
const { hideBin } = nativeRequire('yargs/helpers');
const {
  author,
  license,
  name,
  repository,
  version,
} = require('./package.json');

const AuthService = require('./js/authService.cjs');
const { parseArguments } = require('./js/cli/args.cjs');
const {
  hasExplicitOption,
  mergeFromArgv,
} = require('./js/cli/configMerge.cjs');
const { formatVersionInfo } = require('./js/cli/versionInfo.cjs');
const { runDownloadCommand } = require('./js/commands/download.cjs');
const { runListCommand } = require('./js/commands/list.cjs');
const { resumeArchivedDownloads } = require('./js/commands/resume.cjs');
const { loadLogo, getLastModifiedDate } = require('./js/configUtils.cjs');
const { ConfigurationError, OperationalError } = require('./js/errors.cjs');
const { getErrorMessage, getErrorStack } = require('./js/errorUtils.cjs');
const { metrics } = require('./js/fetchUtils.cjs');
const { parseRegions } = require('./js/io/regionParsing.cjs');
const {
  promptForPassword,
  readPasswordFromStdin,
} = require('./js/io/passwordPrompt.cjs');
const createLogger = require('./js/logger.cjs');
const { createHttpAgent } = require('./js/net/httpAgent.cjs');

/** @type {import('winston').Logger|undefined} */
let activeLogger;

/**
 * Resolves the password from stdin, an already-merged value, or a TTY prompt.
 * @param   {import('./js/types').FinalConfig}          finalConfig - Merged config.
 * @param   {{
 *   logger?: import('winston').Logger,
 *   stdin?: NodeJS.ReadStream,
 *   readStdin?: typeof readPasswordFromStdin,
 *   prompt?: typeof promptForPassword,
 * }} [deps] - Injectable dependencies for tests.
 * @returns {Promise<string>}                                       - Resolved password.
 */
async function resolvePassword(finalConfig, deps = {}) {
  const logger = deps.logger || activeLogger;
  const stdin = deps.stdin || process.stdin;
  const readStdin = deps.readStdin || readPasswordFromStdin;
  const prompt = deps.prompt || promptForPassword;

  if (finalConfig.passwordStdin) {
    if (finalConfig.password && logger) {
      logger.warn(
        '--password-stdin overrides the password supplied via --password/VARVIS_PASSWORD.',
      );
    }
    return readStdin({ stdin });
  }

  if (finalConfig.password) {
    return finalConfig.password;
  }

  if (!stdin.isTTY) {
    throw new ConfigurationError(
      'No password provided. Use --password-stdin, set VARVIS_PASSWORD, or run in an interactive terminal.',
    );
  }

  return prompt();
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

    // The interactive restore prompt (restoreArchived "ask"/"all") lives in the
    // download flow (getDownloadLinks); resume and --list return before it, so
    // the prompt is unreachable there. On a non-TTY, that prompt cannot run:
    // - if the user explicitly asked for an interactive mode on the CLI, that is
    //   a deliberate choice incompatible with the environment, so fail fast.
    // - otherwise (the default "ask" or a config value), downgrade to "no" so a
    //   scripted/CI download of non-archived files still works, and warn that
    //   any archived files will be skipped (pass --restoreArchived force to
    //   restore them non-interactively).
    const willReachRestorePrompt =
      !finalConfig.resumeArchivedDownloads && !finalConfig.list;
    const interactiveRestore =
      finalConfig.restoreArchived === 'ask' ||
      finalConfig.restoreArchived === 'all';
    if (willReachRestorePrompt && interactiveRestore && !process.stdin.isTTY) {
      if (hasExplicitOption(argv, 'restoreArchived')) {
        throw new ConfigurationError(
          'restoreArchived "ask"/"all" needs an interactive terminal. Use --restoreArchived force|no|none for non-interactive runs.',
        );
      }
      activeLogger.warn(
        'No interactive terminal detected; archived files will be skipped. Pass --restoreArchived force to restore them, or --restoreArchived no to silence this warning.',
      );
      finalConfig.restoreArchived = 'no';
    }

    const password = await resolvePassword(finalConfig);
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
      // runDownloadCommand owns the temp BED lifecycle and removes it in its
      // own finally (on success, early return, or throw) — no cleanup here.
      await runDownloadCommand({ finalConfig, regions, tempBedPath }, deps);
    } finally {
      rl.close();
    }
  } finally {
    // Release keep-alive sockets so the CLI exits promptly on completion.
    await agent.close().catch(() => {});
  }
}

if (require.main === module) {
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
}

module.exports = { resolvePassword };
