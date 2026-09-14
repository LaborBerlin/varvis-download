const { mergeConfig } = require('../../../js/cli/configMerge.cjs');
const { parseArguments } = require('../../../js/cli/args.cjs');

describe('bounded-range-proxy configuration merge', () => {
  test('defaults boundedRangeProxy to true and boundedRangeChunkSize to 2097152', () => {
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
      config: {},
      env: {},
    });
    expect(result.boundedRangeProxy).toBe(true);
    expect(result.boundedRangeChunkSize).toBe(2097152);
  });

  test('respects boundedRangeProxy: false from config when no CLI flag is passed', () => {
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
      config: { boundedRangeProxy: false },
      env: {},
    });
    expect(result.boundedRangeProxy).toBe(false);
  });

  test('explicit CLI --bounded-range-proxy overrides config boundedRangeProxy: false', () => {
    const argv = parseArguments([
      '--username',
      'u',
      '--target',
      't',
      '--analysisIds',
      'AN001',
      '--bounded-range-proxy',
    ]);
    const result = mergeConfig({
      argv,
      config: { boundedRangeProxy: false },
      env: {},
    });
    expect(result.boundedRangeProxy).toBe(true);
  });

  test('explicit CLI --no-bounded-range-proxy overrides config boundedRangeProxy: true', () => {
    const argv = parseArguments([
      '--username',
      'u',
      '--target',
      't',
      '--analysisIds',
      'AN001',
      '--no-bounded-range-proxy',
    ]);
    const result = mergeConfig({
      argv,
      config: { boundedRangeProxy: true },
      env: {},
    });
    expect(result.boundedRangeProxy).toBe(false);
  });

  test('merges boundedRangeChunkSize from config when no CLI flag is passed', () => {
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
      config: { boundedRangeChunkSize: 4194304 },
      env: {},
    });
    expect(result.boundedRangeChunkSize).toBe(4194304);
  });

  test('explicit CLI --bounded-range-chunk-size overrides config boundedRangeChunkSize', () => {
    const argv = parseArguments([
      '--username',
      'u',
      '--target',
      't',
      '--analysisIds',
      'AN001',
      '--bounded-range-chunk-size',
      '1048576',
    ]);
    const result = mergeConfig({
      argv,
      config: { boundedRangeChunkSize: 4194304 },
      env: {},
    });
    expect(result.boundedRangeChunkSize).toBe(1048576);
  });

  test('defaults boundedRangeProxyExplicit to false when neither CLI nor config specifies it', () => {
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
      config: {},
      env: {},
    });
    expect(result.boundedRangeProxyExplicit).toBe(false);
  });

  test('marks boundedRangeProxy as explicit when configured as true in config file', () => {
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
      config: { boundedRangeProxy: true },
      env: {},
    });
    expect(result.boundedRangeProxy).toBe(true);
    expect(result.boundedRangeProxyExplicit).toBe(true);
  });

  test('marks boundedRangeProxy as explicit when configured as false in config file', () => {
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
      config: { boundedRangeProxy: false },
      env: {},
    });
    expect(result.boundedRangeProxy).toBe(false);
    expect(result.boundedRangeProxyExplicit).toBe(true);
  });
});
