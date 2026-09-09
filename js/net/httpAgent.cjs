const { CookieJar } = require('tough-cookie');
const { cookie } = require('http-cookie-agent/undici');
const { ProxyAgent, Agent } = require('undici');

/**
 * @typedef {object} HttpAgentOptions
 * @property {string|undefined} proxy         - Proxy URL.
 * @property {string|undefined} proxyUsername - Proxy username.
 * @property {string|undefined} proxyPassword - Proxy password.
 */

// default undici pool timeouts for resilient connection pooling
const DEFAULT_AGENT_OPTIONS = {
  connectTimeout: 15_000,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
};

/**
 * Creates an HTTP agent configured with proxy and cookie support.
 *
 * @param   {Partial<HttpAgentOptions>}         options - Agent options.
 * @returns {import('../types').HttpDispatcher}         - Configured undici dispatcher.
 */
function createHttpAgent({ proxy, proxyUsername, proxyPassword }) {
  const jar = new CookieJar();

  if (!proxy) {
    return new Agent({ ...DEFAULT_AGENT_OPTIONS }).compose(cookie({ jar }));
  }

  /** @type {import('undici').ProxyAgent.Options} */
  const agentOptions = {
    uri: proxy,
    ...DEFAULT_AGENT_OPTIONS,
  };
  if (proxyUsername && proxyPassword) {
    // undici writes opts.token verbatim into the Proxy-Authorization header, so
    // it must be a complete, base64-encoded Basic credential. (opts.auth is
    // deprecated and expects an already-encoded value; token is the modern API.)
    const encoded = Buffer.from(`${proxyUsername}:${proxyPassword}`).toString(
      'base64',
    );
    agentOptions.token = `Basic ${encoded}`;
  }

  return new ProxyAgent(agentOptions).compose(cookie({ jar }));
}

module.exports = { createHttpAgent };
