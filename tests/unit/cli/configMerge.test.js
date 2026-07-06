const { mergeConfig } = require('../../../js/cli/configMerge.cjs');
const { parseArguments } = require('../../../js/cli/args.cjs');
const { ConfigurationError } = require('../../../js/errors.cjs');

describe('CLI config merge', () => {
  test('merges argv over env over config and normalizes CLI arrays', () => {
    const result = mergeConfig({
      argv: {
        username: 'argv-user',
        password: 'argv-password',
        target: 'argv-target',
        analysisIds: ['AN001, AN002'],
        sampleIds: ['S001'],
        limsIds: ['L001,L002'],
        filetypes: ['vcf.gz, vcf.gz.tbi'],
        filter: [' analysisType=SNV ', ' enrichmentKitName^=TwistExome '],
        destination: '/argv/downloads',
        restoreArchived: 'force',
        restorationFile: '/argv/restoration.json',
        resumeArchivedDownloads: false,
        listUrls: true,
        urlFile: '/argv/urls.txt',
        range: 'chr1:1-100',
        unmapped: false,
        latest: true,
      },
      config: {
        username: 'config-user',
        password: 'config-password',
        target: 'config-target',
        analysisIds: ['CONFIG_AN'],
        sampleIds: ['CONFIG_S'],
        limsIds: ['CONFIG_L'],
        filetypes: ['bam'],
        filter: ['configFilter=value'],
        destination: '/config/downloads',
        restoreArchived: 'all',
        restorationFile: '/config/restoration.json',
        resumeArchivedDownloads: true,
        listUrls: false,
        urlFile: '/config/urls.txt',
        range: 'chr2:1-100',
        bed: '/config/regions.bed',
        unmapped: false,
        latest: false,
      },
      env: {
        VARVIS_USER: 'env-user',
        VARVIS_PASSWORD: 'env-password',
        VARVIS_TARGET: 'env-target',
      },
    });

    expect(result).toMatchObject({
      username: 'argv-user',
      password: 'argv-password',
      target: 'argv-target',
      analysisIds: ['AN001', 'AN002'],
      sampleIds: ['S001'],
      limsIds: ['L001', 'L002'],
      filetypes: ['vcf.gz', 'vcf.gz.tbi'],
      filters: ['analysisType=SNV', 'enrichmentKitName^=TwistExome'],
      destination: '/argv/downloads',
      restoreArchived: 'force',
      restorationFile: '/argv/restoration.json',
      resumeArchivedDownloads: false,
      listUrls: true,
      urlFile: '/argv/urls.txt',
      range: 'chr1:1-100',
      bed: '/config/regions.bed',
      unmapped: false,
      latest: true,
    });
  });

  test('uses env credentials and target when argv and config omit them', () => {
    const result = mergeConfig({
      argv: { analysisIds: ['AN001'] },
      config: {},
      env: {
        VARVIS_USER: 'env-user',
        VARVIS_PASSWORD: 'env-password',
        VARVIS_TARGET: 'env-target',
      },
    });

    expect(result.username).toBe('env-user');
    expect(result.password).toBe('env-password');
    expect(result.target).toBe('env-target');
  });

  test('uses config values when real yargs output only contains parser defaults', () => {
    const argv = parseArguments([
      '--username',
      'argv-user',
      '--target',
      'argv-target',
      '--analysisIds',
      'AN001',
    ]);

    const result = mergeConfig({
      argv,
      config: {
        destination: '/config/downloads',
        filetypes: ['vcf.gz', 'vcf.gz.tbi'],
        filter: ['analysisType=SNV'],
        latest: true,
        loglevel: 'debug',
        overwrite: true,
        restorationFile: '/config/restoration.json',
        restoreArchived: 'all',
      },
      env: {},
    });

    expect(result).toMatchObject({
      destination: '/config/downloads',
      filetypes: ['vcf.gz', 'vcf.gz.tbi'],
      filters: ['analysisType=SNV'],
      latest: true,
      loglevel: 'debug',
      overwrite: true,
      restorationFile: '/config/restoration.json',
      restoreArchived: 'all',
    });
  });

  test('uses env credentials and target before config when argv omits them', () => {
    const result = mergeConfig({
      argv: {
        analysisIds: ['AN001'],
      },
      config: {
        username: 'config-user',
        password: 'config-password',
        target: 'config-target',
      },
      env: {
        VARVIS_USER: 'env-user',
        VARVIS_PASSWORD: 'env-password',
        VARVIS_TARGET: 'env-target',
      },
    });

    expect(result.username).toBe('env-user');
    expect(result.password).toBe('env-password');
    expect(result.target).toBe('env-target');
  });

  test('keeps argv credentials and target as highest priority over env', () => {
    const result = mergeConfig({
      argv: {
        username: 'argv-user',
        password: 'argv-password',
        target: 'argv-target',
        analysisIds: ['AN001'],
      },
      config: {},
      env: {
        VARVIS_USER: 'env-user',
        VARVIS_PASSWORD: 'env-password',
        VARVIS_TARGET: 'env-target',
      },
    });

    expect(result.username).toBe('argv-user');
    expect(result.password).toBe('argv-password');
    expect(result.target).toBe('argv-target');
  });

  test('throws ConfigurationError when target is missing after source resolution', () => {
    expect(() =>
      mergeConfig({
        argv: { username: 'argv-user', analysisIds: ['AN001'] },
        config: {},
        env: {},
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      mergeConfig({
        argv: { username: 'argv-user', analysisIds: ['AN001'] },
        config: {},
        env: {},
      }),
    ).toThrow('Missing required argument --target');
  });

  test('throws ConfigurationError when username is missing after source resolution', () => {
    expect(() =>
      mergeConfig({
        argv: { target: 'argv-target', analysisIds: ['AN001'] },
        config: {},
        env: {},
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      mergeConfig({
        argv: { target: 'argv-target', analysisIds: ['AN001'] },
        config: {},
        env: {},
      }),
    ).toThrow('Missing required argument --username');
  });

  test('allows missing password so the entrypoint can prompt later', () => {
    const result = mergeConfig({
      argv: {
        username: 'argv-user',
        target: 'argv-target',
        analysisIds: ['AN001'],
      },
      config: {},
      env: {},
    });

    expect(result.password).toBeUndefined();
  });

  test('throws ConfigurationError when unmapped and bed are combined', () => {
    expect(() =>
      mergeConfig({
        argv: {
          username: 'argv-user',
          target: 'argv-target',
          analysisIds: ['AN001'],
          bed: 'regions.bed',
          unmapped: true,
        },
        config: {},
        env: {},
      }),
    ).toThrow(
      '--unmapped cannot be combined with --bed. Use --unmapped with --range (-g) instead, or use --unmapped alone.',
    );
  });

  test('throws ConfigurationError when no IDs are provided without resume', () => {
    expect(() =>
      mergeConfig({
        argv: {
          username: 'argv-user',
          target: 'argv-target',
          list: true,
        },
        config: {},
        env: {},
      }),
    ).toThrow(
      'You must provide at least one of the following options: analysisIds (-a), sampleIds (-s), limsIds (-l), or set --resumeArchivedDownloads (rad) to process archived downloads.',
    );
  });

  test('passes through password-stdin flag', () => {
    const result = mergeConfig({
      argv: {
        username: 'u',
        target: 't',
        passwordStdin: true,
        analysisIds: ['AN001'],
      },
      config: {},
      env: {},
    });
    expect(result.passwordStdin).toBe(true);
  });

  test('allows resume without IDs', () => {
    const result = mergeConfig({
      argv: {
        username: 'argv-user',
        target: 'argv-target',
        resumeArchivedDownloads: true,
      },
      config: {},
      env: {},
    });

    expect(result.resumeArchivedDownloads).toBe(true);
    expect(result.analysisIds).toEqual([]);
    expect(result.sampleIds).toEqual([]);
    expect(result.limsIds).toEqual([]);
  });
});

describe('credential precedence (CLI > env > config)', () => {
  test('explicit --username overrides VARVIS_USER', () => {
    const result = mergeConfig({
      argv: { username: 'cli-user', target: 't', analysisIds: ['AN001'] },
      config: { username: 'config-user' },
      env: { VARVIS_USER: 'env-user' },
    });
    expect(result.username).toBe('cli-user');
  });

  test('VARVIS_USER overrides config when no CLI flag', () => {
    const result = mergeConfig({
      argv: { target: 't', analysisIds: ['AN001'] },
      config: { username: 'config-user' },
      env: { VARVIS_USER: 'env-user' },
    });
    expect(result.username).toBe('env-user');
  });

  test('VARVIS_TARGET is honored between CLI and config', () => {
    const result = mergeConfig({
      argv: { username: 'u', analysisIds: ['AN001'] },
      config: { target: 'config-target' },
      env: { VARVIS_TARGET: 'env-target' },
    });
    expect(result.target).toBe('env-target');
  });
});

describe('overwrite source tracking', () => {
  test('flags overwrite sourced from config', () => {
    const result = mergeConfig({
      argv: { username: 'u', target: 't', analysisIds: ['AN001'] },
      config: { overwrite: true },
      env: {},
    });
    expect(result.overwrite).toBe(true);
    expect(result.overwriteFromConfig).toBe(true);
  });

  test('does not flag an explicit --overwrite', () => {
    const argv = { username: 'u', target: 't', overwrite: true };
    Object.defineProperty(argv, '__varvisExplicitOptions', {
      enumerable: false,
      value: ['overwrite'],
    });
    const result = mergeConfig({
      argv,
      config: {
        overwrite: true,
        username: 'u',
        target: 't',
        analysisIds: ['AN001'],
      },
      env: {},
    });
    expect(result.overwriteFromConfig).toBe(false);
  });

  test('does not flag when overwrite is false', () => {
    const result = mergeConfig({
      argv: { username: 'u', target: 't', analysisIds: ['AN001'] },
      config: {},
      env: {},
    });
    expect(result.overwriteFromConfig).toBe(false);
  });
});

describe('explicit --destination "."', () => {
  test('explicit -d . wins over config destination', () => {
    const argv = parseArguments([
      '--username',
      'u',
      '--target',
      't',
      '--analysisIds',
      'AN001',
      '-d',
      '.',
    ]);
    const result = mergeConfig({
      argv,
      config: { destination: '/config/dir' },
      env: {},
    });
    expect(result.destination).toBe('.');
  });

  test('default "." (no -d) falls through to config destination', () => {
    const argv = parseArguments([
      '--username',
      'u',
      '--target',
      't',
      '--analysisIds',
      'AN001',
    ]);
    const result = mergeConfig({
      argv,
      config: { destination: '/config/dir' },
      env: {},
    });
    expect(result.destination).toBe('/config/dir');
  });
});
