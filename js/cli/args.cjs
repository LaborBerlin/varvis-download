const { createRequire } = process.getBuiltinModule('node:module');

const nativeRequire = createRequire(__filename);
/** @type {typeof import('yargs')} */
const yargs = nativeRequire('yargs');

const EXPLICIT_OPTIONS_KEY = '__varvisExplicitOptions';

/** @type {Record<string, string>} */
const OPTION_ALIASES = {
  'analysis-ids': 'analysisIds',
  a: 'analysisIds',
  analysisIds: 'analysisIds',
  bed: 'bed',
  b: 'bed',
  c: 'config',
  config: 'config',
  d: 'destination',
  destination: 'destination',
  f: 'filetypes',
  filetypes: 'filetypes',
  F: 'filter',
  filter: 'filter',
  g: 'range',
  h: 'help',
  help: 'help',
  l: 'limsIds',
  limsIds: 'limsIds',
  'lims-ids': 'limsIds',
  list: 'list',
  L: 'list',
  latest: 'latest',
  lf: 'logfile',
  logfile: 'logfile',
  ll: 'loglevel',
  loglevel: 'loglevel',
  o: 'overwrite',
  overwrite: 'overwrite',
  p: 'password',
  password: 'password',
  proxy: 'proxy',
  pxp: 'proxyPassword',
  proxyPassword: 'proxyPassword',
  'proxy-password': 'proxyPassword',
  pxu: 'proxyUsername',
  proxyUsername: 'proxyUsername',
  'proxy-username': 'proxyUsername',
  r: 'reportfile',
  reportfile: 'reportfile',
  ra: 'restoreArchived',
  restoreArchived: 'restoreArchived',
  'restore-archived': 'restoreArchived',
  rad: 'resumeArchivedDownloads',
  resumeArchivedDownloads: 'resumeArchivedDownloads',
  'resume-archived-downloads': 'resumeArchivedDownloads',
  range: 'range',
  restorationFile: 'restorationFile',
  'restoration-file': 'restorationFile',
  rf: 'restorationFile',
  s: 'sampleIds',
  sampleIds: 'sampleIds',
  'sample-ids': 'sampleIds',
  t: 'target',
  target: 'target',
  u: 'username',
  username: 'username',
  U: 'listUrls',
  'list-urls': 'listUrls',
  listUrls: 'listUrls',
  um: 'unmapped',
  unmapped: 'unmapped',
  'url-file': 'urlFile',
  urlFile: 'urlFile',
  v: 'version',
  version: 'version',
  x: 'proxy',
};

/**
 * Records which options were explicitly supplied before yargs applies defaults.
 * @param   {string[]} argv - Raw argument tokens.
 * @returns {string[]}      - Canonical option names supplied by the user.
 */
function collectExplicitOptions(argv) {
  const explicitOptions = new Set();

  for (const token of argv) {
    if (token.length === 2 && token.startsWith('--')) {
      break;
    }
    if (!token.startsWith('-') || token === '-') {
      continue;
    }

    const optionToken = token.startsWith('--')
      ? token.slice(2)
      : token.slice(1);
    const optionName = optionToken.replace(/^no-/, '').split('=')[0];
    const canonicalName = OPTION_ALIASES[optionName] || optionName;
    explicitOptions.add(canonicalName);
  }

  return [...explicitOptions];
}

/**
 * Builds the yargs parser for the varvis-download CLI.
 *
 * @param   {string[]}             argv - Command-line arguments without the node executable or script path.
 * @returns {import('yargs').Argv}      - Configured yargs parser.
 */
function buildParser(argv) {
  const explicitOptions = collectExplicitOptions(argv);

  return yargs(argv)
    .middleware((parsedArgv) => {
      Object.defineProperty(parsedArgv, EXPLICIT_OPTIONS_KEY, {
        enumerable: false,
        value: explicitOptions,
      });
    })
    .usage('$0 <command> [args]')
    .version(false)
    .option('config', {
      alias: 'c',
      describe: 'Path to the configuration file',
      type: 'string',
      default: '.config.json',
    })
    .option('username', {
      alias: 'u',
      describe: 'Varvis API username',
      type: 'string',
    })
    .option('password', {
      alias: 'p',
      describe: 'Varvis API password',
      type: 'string',
    })
    .option('target', {
      alias: 't',
      describe: 'Target for the Varvis API',
      type: 'string',
    })
    .option('analysisIds', {
      alias: 'a',
      describe: 'Analysis IDs to download files for (comma-separated)',
      type: 'array',
    })
    .option('sampleIds', {
      alias: 's',
      describe: 'Sample IDs to filter analyses (comma-separated)',
      type: 'array',
    })
    .option('limsIds', {
      alias: 'l',
      describe: 'LIMS IDs to filter analyses (comma-separated)',
      type: 'array',
    })
    .option('list', {
      alias: 'L',
      describe: 'List available files for the specified analysis IDs',
      type: 'boolean',
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
    .option('proxyUsername', {
      alias: 'pxu',
      describe: 'Proxy username',
      type: 'string',
    })
    .option('proxyPassword', {
      alias: 'pxp',
      describe: 'Proxy password',
      type: 'string',
    })
    .option('overwrite', {
      alias: 'o',
      describe: 'Overwrite existing files',
      type: 'boolean',
      default: false,
    })
    .option('filetypes', {
      alias: 'f',
      describe: 'File types to download (comma-separated)',
      type: 'array',
      default: ['bam', 'bam.bai'],
    })
    .option('loglevel', {
      alias: 'll',
      describe: 'Logging level (info, warn, error, debug)',
      type: 'string',
      default: 'info',
    })
    .option('logfile', {
      alias: 'lf',
      describe: 'Path to the log file',
      type: 'string',
    })
    .option('reportfile', {
      alias: 'r',
      describe: 'Path to the report file',
      type: 'string',
    })
    .option('filter', {
      alias: 'F',
      describe:
        'Filter expressions. Operators: = != > < >= <= (lexicographic), ~= (contains), ^= (starts with). Multiple filters use AND logic. Examples: "analysisType=SNV", "enrichmentKitName^=TwistExome"',
      type: 'array',
      default: [],
    })
    .option('latest', {
      describe:
        'Keep only the newest analysis per sample (highest analysis ID). Useful when samples have repeat sequencing.',
      type: 'boolean',
      default: false,
    })
    .option('range', {
      alias: 'g',
      describe: 'Genomic range for ranged download (e.g., chr1:1-100000)',
      type: 'string',
    })
    .option('bed', {
      alias: 'b',
      describe: 'Path to BED file containing multiple regions',
      type: 'string',
    })
    .option('unmapped', {
      alias: 'um',
      describe:
        'Extract unmapped reads from BAM files (reads with no reference assignment)',
      type: 'boolean',
      default: false,
    })
    .option('restoreArchived', {
      alias: 'ra',
      describe:
        'Restore archived files. Accepts "no", "ask" (default), "all", or "force".',
      type: 'string',
      default: 'ask',
    })
    .option('restorationFile', {
      alias: 'rf',
      describe:
        'Path and name for the awaiting-restoration JSON file (default: "awaiting-restoration.json")',
      type: 'string',
      default: 'awaiting-restoration.json',
    })
    .option('resumeArchivedDownloads', {
      alias: 'rad',
      describe:
        'Resume downloads for archived files from the awaiting-restoration JSON file if restoreEstimation has passed.',
      type: 'boolean',
      default: false,
    })
    .option('list-urls', {
      alias: 'U',
      describe:
        'List the direct download URLs for the selected files instead of downloading them. Useful for piping to other tools.',
      type: 'boolean',
      default: false,
    })
    .option('url-file', {
      describe:
        'Path to a file to save the download URLs when using --list-urls.',
      type: 'string',
    })
    .option('version', {
      alias: 'v',
      type: 'boolean',
      description: 'Show version information',
      default: false,
    })
    .help()
    .alias('help', 'h');
}

module.exports = {
  buildParser,
};
