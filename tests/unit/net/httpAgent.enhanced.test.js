// Mock undici so we can assert WHICH dispatcher is constructed and with what
// options — the real objects are opaque once composed with the cookie jar.
jest.mock('undici', () => {
  const compose = jest.fn(() => ({ dispatch: jest.fn() }));
  return {
    Agent: jest.fn(() => ({ compose })),
    ProxyAgent: jest.fn(() => ({ compose })),
  };
});

const { Agent, ProxyAgent } = require('undici');
const { createHttpAgent } = require('../../../js/net/httpAgent.cjs');

describe('net/httpAgent.createHttpAgent construction', () => {
  test('uses a plain Agent (not a ProxyAgent) configured with pool timeouts when no proxy is configured', () => {
    createHttpAgent({});

    expect(Agent).toHaveBeenCalledTimes(1);
    expect(Agent).toHaveBeenCalledWith({
      connectTimeout: 15_000,
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
    });
    expect(ProxyAgent).not.toHaveBeenCalled();
  });

  test('uses a ProxyAgent with the proxy URI and pool timeouts when a proxy is configured', () => {
    createHttpAgent({ proxy: 'http://example.test:8080' });

    expect(ProxyAgent).toHaveBeenCalledTimes(1);
    expect(ProxyAgent).toHaveBeenCalledWith({
      uri: 'http://example.test:8080',
      connectTimeout: 15_000,
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
    });
    expect(Agent).not.toHaveBeenCalled();
  });

  test('passes basic-auth credentials and pool timeouts to the ProxyAgent when both are set', () => {
    createHttpAgent({
      proxy: 'http://example.test:8080',
      proxyUsername: 'user',
      proxyPassword: 'pass',
    });

    expect(ProxyAgent).toHaveBeenCalledWith({
      uri: 'http://example.test:8080',
      token: 'Basic dXNlcjpwYXNz', // base64('user:pass')
      connectTimeout: 15_000,
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
    });
  });

  test('omits auth but retains pool timeouts when only one credential half is present', () => {
    createHttpAgent({
      proxy: 'http://example.test:8080',
      proxyUsername: 'user',
    });

    expect(ProxyAgent).toHaveBeenCalledWith({
      uri: 'http://example.test:8080',
      connectTimeout: 15_000,
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
    });
  });
});
