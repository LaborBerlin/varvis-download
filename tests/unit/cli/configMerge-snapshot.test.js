const { parseArguments } = require('../../../js/cli/args.cjs');
const { mergeConfig } = require('../../../js/cli/configMerge.cjs');
const input = require('../../fixtures/cli-output/configMerge-input.json');
const expectedConfig = require('../../fixtures/cli-output/configMerge.json');

describe('CLI config merge snapshot', () => {
  test('matches the captured merge fixture', () => {
    const argv = parseArguments(input.argv);

    const result = mergeConfig({
      argv,
      config: input.configFile,
      env: {},
    });

    expect(result).toEqual(expectedConfig);
    for (const rawYargsKey of [
      '_',
      '$0',
      'u',
      'p',
      'a',
      'analysis-ids',
      'filter',
      'F',
    ]) {
      expect(result).not.toHaveProperty(rawYargsKey);
    }
  });
});
