const { fetch } = require('undici');
const { getErrorMessage } = require('./errorUtils.cjs');

/**
 * Default headers for all requests to avoid undici v7's automatic sec-fetch-mode: cors
 * header which causes Spring Security servers to reject requests as cross-origin.
 * @type {Record<string, string>}
 */
const DEFAULT_HEADERS = {
  'User-Agent': 'varvis-download',
  'Sec-Fetch-Mode': 'same-origin',
};

/**
 * API Client class for handling HTTP requests with retry logic and agent management.
 */
class ApiClient {
  /**
   * Creates an instance of ApiClient.
   * @param {import('./types').HttpDispatcher} agent  - The HTTP agent instance.
   * @param {import('winston').Logger}         logger - The logger instance.
   */
  constructor(agent, logger) {
    this.agent = agent;
    this.logger = logger;
  }

  /**
   * Retries a fetch operation with a specified number of attempts.
   * @param   {string}                                 url     - The URL to fetch.
   * @param   {import('./types').UndiciRequestOptions} options - The fetch options.
   * @param   {number}                                 retries - The number of retry attempts.
   * @returns {Promise<import('undici').Response>}             - The fetch response.
   */
  async fetchWithRetry(url, options, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: { ...DEFAULT_HEADERS, ...options.headers },
          dispatcher: this.agent,
        });
        if (!response.ok)
          throw new Error(`Fetch failed with status: ${response.status}`);
        return response;
      } catch (error) {
        if (attempt < retries) {
          this.logger.warn(`Fetch attempt ${attempt} failed. Retrying...`);
          await new Promise((res) => setTimeout(res, attempt * 1000)); // Exponential backoff
        } else {
          this.logger.error(
            `Fetch failed after ${retries} attempts: ${getErrorMessage(error)}`,
          );
          throw error;
        }
      }
    }
    throw new Error('Fetch failed without executing a request');
  }
}

/**
 * Creates and configures an API client instance.
 * @param   {import('./types').HttpDispatcher} agent  - The HTTP agent instance.
 * @param   {import('winston').Logger}         logger - The logger instance.
 * @returns {ApiClient}                               - The configured API client instance.
 */
function createApiClient(agent, logger) {
  return new ApiClient(agent, logger);
}

/**
 * Legacy function export for backwards compatibility
 * @param   {string}                                 url     - The URL to fetch
 * @param   {import('./types').UndiciRequestOptions} options - Fetch options (must include dispatcher)
 * @param   {number}                                 retries - Number of retry attempts
 * @param   {import('winston').Logger}               logger  - Logger instance
 * @returns {Promise<import('undici').Response>}             - Fetch response
 */
async function fetchWithRetry(url, options, retries = 3, logger) {
  // Extract agent from options if present
  const agent = options.dispatcher;
  if (!agent) {
    throw new Error('Agent (dispatcher) is required for fetchWithRetry');
  }

  const client = new ApiClient(agent, logger);
  return client.fetchWithRetry(url, options, retries);
}

module.exports = {
  ApiClient,
  createApiClient,
  fetchWithRetry,
};
