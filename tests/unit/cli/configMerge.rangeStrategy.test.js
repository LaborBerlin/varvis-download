const { mergeConfig } = require('../../../js/cli/configMerge.cjs');

const baseArgv = {
  username: 'u',
  password: 'p',
  target: 't',
  analysisIds: ['A1'],
};

describe('configMerge rangeStrategy', () => {
  test('defaults to planned', () => {
    expect(
      mergeConfig({ argv: baseArgv, config: {}, env: {} }).rangeStrategy,
    ).toBe('planned');
  });

  test('reads the config file and lets argv override it', () => {
    expect(
      mergeConfig({
        argv: baseArgv,
        config: { rangeStrategy: 'stream' },
        env: {},
      }).rangeStrategy,
    ).toBe('stream');
    expect(
      mergeConfig({
        argv: { ...baseArgv, rangeStrategy: 'planned' },
        config: { rangeStrategy: 'stream' },
        env: {},
      }).rangeStrategy,
    ).toBe('planned');
  });

  test('rejects unknown strategies', () => {
    expect(() =>
      mergeConfig({
        argv: baseArgv,
        config: { rangeStrategy: 'proxy' },
        env: {},
      }),
    ).toThrow(/Invalid rangeStrategy/);
  });
});
