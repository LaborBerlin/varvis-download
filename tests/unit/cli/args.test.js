const {
  buildParser,
  parseArguments,
  EXPLICIT_OPTIONS_KEY,
} = require('../../../js/cli/args.cjs');

describe('CLI argument parser', () => {
  function parse(arguments_) {
    return buildParser(arguments_).exitProcess(false).parseSync();
  }

  test('parses required CLI options', () => {
    const argv = parse([
      '--username',
      'api-user',
      '--password',
      'api-password',
      '--target',
      'playground',
      '--analysisIds',
      'AN001',
    ]);

    expect(argv.username).toBe('api-user');
    expect(argv.password).toBe('api-password');
    expect(argv.target).toBe('playground');
    expect(argv.analysisIds).toEqual(['AN001']);
  });

  test('defaults unmapped to false', () => {
    const argv = parse([]);

    expect(argv.unmapped).toBe(false);
  });

  test('defaults latest to false', () => {
    const argv = parse([]);

    expect(argv.latest).toBe(false);
  });

  test('defaults password-stdin to false', () => {
    expect(parse([]).passwordStdin).toBe(false);
  });

  test('parses --password-stdin as a boolean flag', () => {
    expect(parse(['--password-stdin']).passwordStdin).toBe(true);
  });

  test('defaults bounded-range-proxy to true', () => {
    const argv = parse([]);

    expect(argv.boundedRangeProxy).toBe(true);
  });

  test('parses --no-bounded-range-proxy as false', () => {
    const argv = parse(['--no-bounded-range-proxy']);

    expect(argv.boundedRangeProxy).toBe(false);
  });

  test('parses --bounded-range-chunk-size as number', () => {
    const argv = parse(['--bounded-range-chunk-size', '1048576']);

    expect(argv.boundedRangeChunkSize).toBe(1048576);
  });

  test('defaults bounded-range-chunk-size to 2097152', () => {
    const argv = parse([]);

    expect(argv.boundedRangeChunkSize).toBe(2097152);
  });

  test('parses multiple filter values', () => {
    const argv = parse([
      '--filter',
      'analysisType=SNV',
      '--filter',
      'enrichmentKitName^=TwistExome',
    ]);

    expect(argv.filter).toEqual([
      'analysisType=SNV',
      'enrichmentKitName^=TwistExome',
    ]);
  });
});

describe('yargs parse metadata (characterization)', () => {
  function parsed(arguments_) {
    const parser = buildParser(arguments_).exitProcess(false);
    parser.parseSync();
    return parser.parsed;
  }

  test('bundled short flags -oL are both explicit (not defaulted)', () => {
    const { defaulted } = parsed(['-oL']);
    expect('overwrite' in defaulted).toBe(false);
    expect('list' in defaulted).toBe(false);
  });

  test('an untouched boolean stays in defaulted', () => {
    const { defaulted } = parsed([]);
    expect(defaulted.overwrite).toBe(true);
  });

  test('aliases expose the canonical camelCase group', () => {
    const { aliases } = parsed(['--list-urls']);
    expect(aliases.listUrls).toEqual(
      expect.arrayContaining(['list-urls', 'U']),
    );
  });

  test('multi-char alias --um marks unmapped explicit', () => {
    const { defaulted } = parsed(['--um']);
    expect('unmapped' in defaulted).toBe(false);
  });
});

describe('parseArguments explicit-option detection', () => {
  function explicit(arguments_) {
    return parseArguments(arguments_)[EXPLICIT_OPTIONS_KEY];
  }

  test('bundled short flags -oL are detected as explicit', () => {
    const set = explicit(['-oL']);
    expect(set).toEqual(expect.arrayContaining(['overwrite', 'list']));
  });

  test('unset options are not explicit', () => {
    expect(explicit([])).not.toContain('overwrite');
    expect(explicit([])).not.toContain('unmapped');
  });

  test('multi-char alias --um marks unmapped explicit', () => {
    expect(explicit(['--um'])).toContain('unmapped');
  });

  test('dashed --list-urls maps to canonical listUrls', () => {
    expect(explicit(['--list-urls'])).toContain('listUrls');
  });

  test('--no-overwrite is explicit (negation counts as user-supplied)', () => {
    expect(explicit(['--no-overwrite'])).toContain('overwrite');
  });

  test('--no-bounded-range-proxy is explicit', () => {
    expect(explicit(['--no-bounded-range-proxy'])).toContain(
      'boundedRangeProxy',
    );
  });

  test('--bounded-range-chunk-size is explicit', () => {
    expect(explicit(['--bounded-range-chunk-size', '1048576'])).toContain(
      'boundedRangeChunkSize',
    );
  });

  test('defaulted options (incl. their aliases) are NOT explicit', () => {
    const set = explicit([]);
    for (const name of [
      'config',
      'destination',
      'filetypes',
      'overwrite',
      'listUrls',
      'restoreArchived',
      'unmapped',
      'latest',
      'boundedRangeProxy',
      'boundedRangeChunkSize',
    ]) {
      expect(set).not.toContain(name);
    }
    // alias keys of defaulted options must not leak in either
    for (const alias of ['o', 'd', 'c', 'f', 'U', 'ra', 'um']) {
      expect(set).not.toContain(alias);
    }
  });
});
