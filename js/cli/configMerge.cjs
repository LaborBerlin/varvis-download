const path = require('node:path');

const {
  normalizeArrayInput,
  normalizeFiletypes,
  normalizeStringOption,
} = require('../arrayUtils.cjs');
const { EXPLICIT_OPTIONS_KEY } = require('./args.cjs');
const { loadConfig } = require('../configUtils.cjs');
const { ConfigurationError } = require('../errors.cjs');

/**
 * @typedef {Record<string, unknown> & {
 *   analysisIds?: (string|number)[],
 *   bed?: string|string[]|null,
 *   boundedRangeChunkSize?: number|string|null,
 *   boundedRangeProxy?: boolean,
 *   config?: string|string[]|null,
 *   destination?: string|string[]|null,
 *   filetypes?: string[],
 *   filter?: string[],
 *   filters?: string[],
 *   limsIds?: (string|number)[],
 *   listUrls?: boolean,
 *   overwrite?: boolean,
 *   password?: string|string[]|null,
 *   passwordStdin?: boolean,
 *   range?: string|string[]|null,
 *   restorationFile?: string|string[]|null,
 *   restoreArchived?: string|string[]|null,
 *   resumeArchivedDownloads?: boolean,
 *   sampleIds?: (string|number)[],
 *   target?: string|string[]|null,
 *   unmapped?: boolean,
 *   urlFile?: string|string[]|null,
 *   username?: string|string[]|null,
 *   latest?: boolean,
 * }} MergeSource
 */

/**
 * @typedef {object} MergeOptions
 * @property {MergeSource}       argv   - Parsed command-line arguments.
 * @property {MergeSource}       config - Loaded configuration file values.
 * @property {NodeJS.ProcessEnv} env    - Environment variables.
 */

/**
 * Normalizes a possibly repeated string option.
 * @param   {string|string[]|null|undefined} value - Option value from argv, config, or env.
 * @returns {string|undefined}                     - Normalized string value.
 */
function normalizeOptionalString(value) {
  if (value === null) {
    return;
  }
  return normalizeStringOption(value);
}

/**
 * Returns the first non-empty string from a list of possible sources.
 * @param   {...(string|string[]|null|undefined)} values - Values in priority order.
 * @returns {string|undefined}                           - First non-empty string.
 */
function firstNonEmptyString(...values) {
  for (const value of values) {
    const normalized = normalizeOptionalString(value);
    if (normalized) {
      return normalized;
    }
  }
  return;
}

/**
 * Checks whether argv metadata says an option was supplied explicitly.
 * Plain objects without metadata are treated as already-normalized test/config sources.
 * @param   {MergeSource} argv - Parsed argv or test source.
 * @param   {string}      key  - Canonical option name.
 * @returns {boolean}          - True when the option should override config.
 */
function hasExplicitOption(argv, key) {
  const explicitOptions = argv[EXPLICIT_OPTIONS_KEY];
  if (Array.isArray(explicitOptions)) {
    return explicitOptions.includes(key);
  }

  return (
    Object.prototype.hasOwnProperty.call(argv, key) && argv[key] !== undefined
  );
}

/**
 * Returns an argv option only when the user explicitly supplied it.
 * @param   {MergeSource} argv - Parsed argv or test source.
 * @param   {string}      key  - Canonical option name.
 * @returns {unknown}          - Explicit value, or undefined.
 */
function getExplicitOption(argv, key) {
  return hasExplicitOption(argv, key) ? argv[key] : undefined;
}

/**
 * Merges a boolean option while ignoring parser defaults.
 * @param   {MergeSource} argv         - Parsed argv.
 * @param   {MergeSource} config       - Config file values.
 * @param   {string}      key          - Option name.
 * @param   {boolean}     defaultValue - Fallback when neither source provides a boolean.
 * @returns {boolean}                  - Merged boolean.
 */
function mergeBoolean(argv, config, key, defaultValue) {
  const argvValue = getExplicitOption(argv, key);
  if (typeof argvValue === 'boolean') {
    return argvValue;
  }
  const configValue = config[key];
  if (typeof configValue === 'boolean') {
    return configValue;
  }
  return defaultValue;
}

/**
 * Builds a config-shaped object from documented environment variables.
 * @param   {NodeJS.ProcessEnv} env - Process environment variables.
 * @returns {MergeSource}           - Environment-derived config values.
 */
function getEnvConfig(env) {
  /** @type {MergeSource} */
  const envConfig = {};
  const username = firstNonEmptyString(env.VARVIS_USER);
  const password = firstNonEmptyString(env.VARVIS_PASSWORD);
  const target = firstNonEmptyString(env.VARVIS_TARGET);

  if (username) {
    envConfig.username = username;
  }
  if (password) {
    envConfig.password = password;
  }
  if (target) {
    envConfig.target = target;
  }

  return envConfig;
}

/**
 * Normalizes filter expressions from argv or config.
 * @param   {string[]|undefined} argvFilters   - Filter expressions from argv.
 * @param   {string[]|undefined} configFilters - Filter expressions from config.
 * @returns {string[]}                         - Trimmed filter expressions.
 */
function normalizeFilters(argvFilters, configFilters) {
  const rawFilters = argvFilters || configFilters || [];
  return rawFilters.map((filter) => filter.trim());
}

/**
 * Validates combinations and identifier requirements.
 * @param {import('../types').FinalConfig} config - Final merged config.
 */
function validateConfig(config) {
  if (config.unmapped && config.bed) {
    throw new ConfigurationError(
      '--unmapped cannot be combined with --bed. Use --unmapped with --range (-g) instead, or use --unmapped alone.',
    );
  }

  if (
    config.analysisIds.length === 0 &&
    config.sampleIds.length === 0 &&
    config.limsIds.length === 0 &&
    !config.resumeArchivedDownloads
  ) {
    throw new ConfigurationError(
      'You must provide at least one of the following options: analysisIds (-a), sampleIds (-s), limsIds (-l), or set --resumeArchivedDownloads (rad) to process archived downloads.',
    );
  }
}

/**
 * Merges argv, config file values, environment variables, and defaults.
 * @param   {MergeOptions}                   options - Merge input sources.
 * @returns {import('../types').FinalConfig}         - Final merged config.
 */
function mergeConfig({ argv, config = {}, env = {} }) {
  const envConfig = getEnvConfig(env);
  const username = firstNonEmptyString(
    /** @type {string|string[]|null|undefined} */ (
      getExplicitOption(argv, 'username')
    ),
    envConfig.username,
    config.username,
  );
  const password = firstNonEmptyString(
    /** @type {string|string[]|null|undefined} */ (
      getExplicitOption(argv, 'password')
    ),
    envConfig.password,
    config.password,
  );
  const target = firstNonEmptyString(
    /** @type {string|string[]|null|undefined} */ (
      getExplicitOption(argv, 'target')
    ),
    envConfig.target,
    config.target,
  );

  if (!username) {
    throw new ConfigurationError('Missing required argument --username');
  }
  if (!target) {
    throw new ConfigurationError('Missing required argument --target');
  }

  const normalizedDestination = normalizeOptionalString(
    /** @type {string|string[]|null|undefined} */ (
      getExplicitOption(argv, 'destination')
    ),
  );
  const normalizedRestorationFile = normalizeOptionalString(
    /** @type {string|string[]|null|undefined} */ (
      getExplicitOption(argv, 'restorationFile')
    ),
  );
  const normalizedUrlFile = normalizeOptionalString(
    /** @type {string|string[]|null|undefined} */ (
      getExplicitOption(argv, 'urlFile')
    ),
  );
  const normalizedRange = normalizeOptionalString(
    /** @type {string|string[]|null|undefined} */ (
      getExplicitOption(argv, 'range')
    ),
  );
  const normalizedBed = normalizeOptionalString(
    /** @type {string|string[]|null|undefined} */ (
      getExplicitOption(argv, 'bed')
    ),
  );
  const explicitFiletypes = /** @type {string[]|undefined} */ (
    getExplicitOption(argv, 'filetypes')
  );
  const explicitFilters = /** @type {string[]|undefined} */ (
    getExplicitOption(argv, 'filter')
  );
  const configFilters = config.filter || config.filters;
  const configPath =
    normalizeOptionalString(
      /** @type {string|string[]|null|undefined} */ (
        getExplicitOption(argv, 'config')
      ),
    ) || firstNonEmptyString(config.config);
  const logfile = firstNonEmptyString(
    /** @type {string|string[]|null|undefined} */ (
      getExplicitOption(argv, 'logfile')
    ),
    /** @type {string|string[]|null|undefined} */ (config.logfile),
  );
  const proxy = firstNonEmptyString(
    /** @type {string|string[]|null|undefined} */ (
      getExplicitOption(argv, 'proxy')
    ),
    /** @type {string|string[]|null|undefined} */ (config.proxy),
  );
  const proxyUsername = firstNonEmptyString(
    /** @type {string|string[]|null|undefined} */ (
      getExplicitOption(argv, 'proxyUsername')
    ),
    /** @type {string|string[]|null|undefined} */ (config.proxyUsername),
  );
  const proxyPassword = firstNonEmptyString(
    /** @type {string|string[]|null|undefined} */ (
      getExplicitOption(argv, 'proxyPassword')
    ),
    /** @type {string|string[]|null|undefined} */ (config.proxyPassword),
  );
  const reportfile = firstNonEmptyString(
    /** @type {string|string[]|null|undefined} */ (
      getExplicitOption(argv, 'reportfile')
    ),
    /** @type {string|string[]|null|undefined} */ (config.reportfile),
  );
  const loglevel =
    firstNonEmptyString(
      /** @type {string|string[]|null|undefined} */ (
        getExplicitOption(argv, 'loglevel')
      ),
      /** @type {string|string[]|null|undefined} */ (config.loglevel),
    ) || 'info';

  const overwrite = mergeBoolean(argv, config, 'overwrite', false);
  const overwriteFromConfig =
    overwrite === true &&
    !hasExplicitOption(argv, 'overwrite') &&
    config.overwrite === true;

  // resolve bounded range proxy settings
  const boundedRangeProxy = mergeBoolean(
    argv,
    config,
    'boundedRangeProxy',
    true,
  );
  const boundedRangeProxyExplicit = hasExplicitOption(
    argv,
    'boundedRangeProxy',
  );
  const explicitChunkSize = getExplicitOption(argv, 'boundedRangeChunkSize');
  const rawChunkSize =
    explicitChunkSize !== undefined
      ? explicitChunkSize
      : config.boundedRangeChunkSize;
  const boundedRangeChunkSize =
    typeof rawChunkSize === 'number' && !Number.isNaN(rawChunkSize)
      ? rawChunkSize
      : typeof rawChunkSize === 'string' &&
          !Number.isNaN(Number(rawChunkSize)) &&
          rawChunkSize.trim() !== ''
        ? Number(rawChunkSize)
        : 2097152;

  /** @type {import('../types').FinalConfig} */
  const finalConfig = {
    username,
    password,
    target,
    filetypes: normalizeFiletypes(explicitFiletypes, config.filetypes),
    analysisIds: normalizeArrayInput(
      /** @type {(string|number)[]|undefined} */ (
        getExplicitOption(argv, 'analysisIds')
      ),
      config.analysisIds,
      [],
    ),
    sampleIds: normalizeArrayInput(
      /** @type {(string|number)[]|undefined} */ (
        getExplicitOption(argv, 'sampleIds')
      ),
      config.sampleIds,
      [],
    ),
    limsIds: normalizeArrayInput(
      /** @type {(string|number)[]|undefined} */ (
        getExplicitOption(argv, 'limsIds')
      ),
      config.limsIds,
      [],
    ),
    filters: normalizeFilters(explicitFilters, configFilters),
    destination: hasExplicitOption(argv, 'destination')
      ? normalizedDestination || '.'
      : firstNonEmptyString(config.destination) || normalizedDestination || '.',
    restoreArchived: /** @type {import('../types').RestoreMode} */ (
      firstNonEmptyString(
        /** @type {string|string[]|null|undefined} */ (
          getExplicitOption(argv, 'restoreArchived')
        ),
        config.restoreArchived,
      ) || 'ask'
    ),
    restorationFile:
      normalizedRestorationFile ||
      firstNonEmptyString(config.restorationFile) ||
      'awaiting-restoration.json',
    resumeArchivedDownloads: mergeBoolean(
      argv,
      config,
      'resumeArchivedDownloads',
      false,
    ),
    listUrls: mergeBoolean(argv, config, 'listUrls', false),
    overwrite,
    overwriteFromConfig,
    passwordStdin: mergeBoolean(argv, config, 'passwordStdin', false),
    urlFile:
      normalizedUrlFile ||
      firstNonEmptyString(
        /** @type {string|string[]|null|undefined} */ (config.urlFile),
      ) ||
      null,
    range:
      normalizedRange ||
      firstNonEmptyString(
        /** @type {string|string[]|null|undefined} */ (config.range),
      ) ||
      null,
    bed:
      normalizedBed ||
      firstNonEmptyString(
        /** @type {string|string[]|null|undefined} */ (config.bed),
      ) ||
      null,
    unmapped: mergeBoolean(argv, config, 'unmapped', false),
    latest: mergeBoolean(argv, config, 'latest', false),
    list: mergeBoolean(argv, config, 'list', false),
    loglevel,
    version: mergeBoolean(argv, config, 'version', false),
    boundedRangeProxy,
    boundedRangeChunkSize,
    boundedRangeProxyExplicit,
  };

  if (configPath) {
    finalConfig.config = configPath;
  }
  if (logfile) {
    finalConfig.logfile = logfile;
  }
  if (proxy) {
    finalConfig.proxy = proxy;
  }
  if (proxyUsername) {
    finalConfig.proxyUsername = proxyUsername;
  }
  if (proxyPassword) {
    finalConfig.proxyPassword = proxyPassword;
  }
  if (reportfile) {
    finalConfig.reportfile = reportfile;
  }

  validateConfig(finalConfig);
  return finalConfig;
}

/**
 * Loads the selected config file, then merges it with argv and env.
 * @param   {MergeSource}                    argv - Parsed command-line arguments.
 * @param   {NodeJS.ProcessEnv}              env  - Environment variables.
 * @returns {import('../types').FinalConfig}      - Final merged config.
 */
function mergeFromArgv(argv, env = process.env) {
  const configFilePath = path.resolve(
    normalizeOptionalString(argv.config) || '.config.json',
  );
  const config = loadConfig(configFilePath);

  return mergeConfig({ argv, config, env });
}

module.exports = {
  hasExplicitOption,
  mergeConfig,
  mergeFromArgv,
};
