const { buildParser } = require('../../../js/cli/args.cjs');

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
