const { CookieJar } = require('tough-cookie');
const { cookie } = require('http-cookie-agent/undici');
const { ProxyAgent, Agent } = require('undici');

/**
 * @typedef {object} HttpAgentOptions
 * @property {string|undefined} proxy         - Proxy URL.
 * @property {string|undefined} proxyUsername - Proxy username.
 * @property {string|undefined} proxyPassword - Proxy password.
 */

/**
 * Creates an HTTP agent configured with proxy and cookie support.
 *
 * @param   {Partial<HttpAgentOptions>}         options - Agent options.
 * @returns {import('../types').HttpDispatcher}         - Configured undici dispatcher.
 */
function createHttpAgent({ proxy, proxyUsername, proxyPassword }) {
  const jar = new CookieJar();

  if (!proxy) {
    return new Agent().compose(cookie({ jar }));
  }

  /** @type {import('undici').ProxyAgent.Options} */
  const agentOptions = { uri: proxy };
  if (proxyUsername && proxyPassword) {
    agentOptions.auth = `${proxyUsername}:${proxyPassword}`;
  }

  return new ProxyAgent(agentOptions).compose(cookie({ jar }));
}

module.exports = { createHttpAgent };
