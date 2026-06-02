const { createHttpAgent } = require('../../../js/net/httpAgent.cjs');

describe('net/httpAgent.createHttpAgent', () => {
  test('returns an agent without proxy', () => {
    const agent = createHttpAgent({});

    expect(agent).toBeDefined();
    expect(typeof agent.dispatch).toBe('function');
  });

  test('returns a proxy agent when proxy URL provided', () => {
    const agent = createHttpAgent({ proxy: 'http://example.test:8080' });

    expect(agent).toBeDefined();
    expect(typeof agent.dispatch).toBe('function');
  });

  test('proxy with credentials does not throw', () => {
    expect(() =>
      createHttpAgent({
        proxy: 'http://example.test:8080',
        proxyUsername: 'u',
        proxyPassword: 'p',
      }),
    ).not.toThrow();
  });
});
