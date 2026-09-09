const nodeModule = process.getBuiltinModule('node:module');
const hostCreateRequire =
  Object.getPrototypeOf(nodeModule)?.createRequire || nodeModule.createRequire;

const nativeRequire = hostCreateRequire(__filename);
/** @type {typeof import('yargs')} */
const yargs = nativeRequire('yargs');

const EXPLICIT_OPTIONS_KEY = '__varvisExplicitOptions';

/**
 * Builds the yargs parser for the varvis-download CLI.
 *
 * @param   {string[]}             argv - Command-line arguments without the node executable or script path.
 * @returns {import('yargs').Argv}      - Configured yargs parser.
 */
function buildParser(argv) {
  return yargs(argv)
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
    .option('password-stdin', {
      describe: 'Read the Varvis API password from the first line of stdin',
      type: 'boolean',
      default: false,
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
    .option('bounded-range-proxy', {
      describe:
        'Enable local bounded-range reverse proxy for remote ranged downloads (guards against excessive S3 egress).',
      type: 'boolean',
      default: true,
    })
    .option('bounded-range-chunk-size', {
      describe:
        'Chunk size in bytes for the bounded-range reverse proxy (default: 2097152 [2 MiB]).',
      type: 'number',
      default: 2097152,
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

/**
 * @typedef {import('yargs-parser').DetailedArguments & {
 *   defaulted?: Record<string, boolean>,
 *   aliases?: Record<string, string[]>,
 * }} ParsedArgsMeta
 */

/**
 * Derives the names (canonical + aliases) of options supplied explicitly.
 * Decides per alias group: explicit iff some member is present in argv and no
 * member was populated from a parser default.
 * @param   {Record<string, unknown>} argv   - Parsed argv.
 * @param   {ParsedArgsMeta}          parsed - yargs parse metadata.
 * @returns {string[]}                       - Explicit option names (all group members).
 */
function computeExplicitOptions(argv, parsed) {
  const defaulted = parsed.defaulted || {};
  const aliases = parsed.aliases || {};
  const explicit = new Set();
  const grouped = new Set();
  const hasKey = (/** @type {string} */ key) =>
    Object.prototype.hasOwnProperty.call(argv, key);

  for (const [canonical, group] of Object.entries(aliases)) {
    const members = [canonical, ...group];
    members.forEach((member) => grouped.add(member));
    const present = members.some(hasKey);
    const anyDefaulted = members.some((member) => member in defaulted);
    if (present && !anyDefaulted) {
      members.forEach((member) => explicit.add(member));
    }
  }

  for (const key of Object.keys(argv)) {
    if (key === '_' || key === '$0' || grouped.has(key)) {
      continue;
    }
    if (!(key in defaulted)) {
      explicit.add(key);
    }
  }

  return [...explicit];
}

/**
 * Parses CLI arguments and tags the result with the explicit-option set.
 * @param   {string[]}                rawArgs - Arguments without the node executable/script path.
 * @returns {Record<string, unknown>}         - Parsed argv with a non-enumerable explicit-option list.
 */
function parseArguments(rawArgs) {
  const parser = buildParser(rawArgs);
  const argv = parser.parseSync();
  const parsed = /** @type {ParsedArgsMeta} */ (parser.parsed);
  Object.defineProperty(argv, EXPLICIT_OPTIONS_KEY, {
    enumerable: false,
    value: computeExplicitOptions(argv, parsed),
  });
  return argv;
}

module.exports = {
  EXPLICIT_OPTIONS_KEY,
  buildParser,
  parseArguments,
};
