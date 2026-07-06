jest.mock('../../../js/configUtils.cjs', () => ({
  loadConfig: jest.fn(() => ({})),
}));

const {
  mergeConfig,
  mergeFromArgv,
} = require('../../../js/cli/configMerge.cjs');
const { loadConfig } = require('../../../js/configUtils.cjs');

const baseArgv = {
  username: 'u',
  password: 'p',
  target: 't',
  analysisIds: ['A1'],
};

describe('configMerge proxy/logfile/reportfile passthrough', () => {
  test('includes proxy credentials, logfile and reportfile when provided', () => {
    const result = mergeConfig({
      argv: {
        ...baseArgv,
        proxy: 'http://proxy:8080',
        proxyUsername: 'pu',
        proxyPassword: 'pp',
        logfile: 'run.log',
        reportfile: 'report.txt',
      },
      config: {},
      env: {},
    });

    expect(result.proxy).toBe('http://proxy:8080');
    expect(result.proxyUsername).toBe('pu');
    expect(result.proxyPassword).toBe('pp');
    expect(result.logfile).toBe('run.log');
    expect(result.reportfile).toBe('report.txt');
  });

  test('omits optional proxy/logfile/reportfile keys when absent', () => {
    const result = mergeConfig({ argv: { ...baseArgv }, config: {}, env: {} });

    expect(result).not.toHaveProperty('proxy');
    expect(result).not.toHaveProperty('proxyUsername');
    expect(result).not.toHaveProperty('logfile');
    expect(result).not.toHaveProperty('reportfile');
  });

  test('falls back to config-file values for proxy and logfile', () => {
    const result = mergeConfig({
      argv: { ...baseArgv },
      config: { proxy: 'http://config-proxy:3128', logfile: 'config.log' },
      env: {},
    });

    expect(result.proxy).toBe('http://config-proxy:3128');
    expect(result.logfile).toBe('config.log');
  });
});

describe('configMerge.mergeFromArgv', () => {
  test('resolves the --config path, loads it, and lets argv win over config', () => {
    loadConfig.mockReturnValue({ target: 'config-target' });

    const result = mergeFromArgv({ ...baseArgv, config: 'my.config.json' }, {});

    expect(loadConfig).toHaveBeenCalledWith(
      expect.stringContaining('my.config.json'),
    );
    expect(result.username).toBe('u');
    expect(result.target).toBe('t');
  });

  test('defaults to .config.json when no --config is provided', () => {
    loadConfig.mockReturnValue({});

    mergeFromArgv({ ...baseArgv }, {});

    expect(loadConfig).toHaveBeenCalledWith(
      expect.stringContaining('.config.json'),
    );
  });
});
