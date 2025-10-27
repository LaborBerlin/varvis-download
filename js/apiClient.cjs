const { fetch } = require('undici');

/**
 * API Client class for handling HTTP requests with retry logic and agent management.
 */
class ApiClient {
  /**
   * Creates an instance of ApiClient.
   * @param {object} agent  - The HTTP agent instance.
   * @param {object} logger - The logger instance.
   */
  constructor(agent, logger) {
    this.agent = agent;
    this.logger = logger;
  }

  /**
   * Retries a fetch operation with a specified number of attempts.
   * @param   {string}            url     - The URL to fetch.
   * @param   {object}            options - The fetch options.
   * @param   {number}            retries - The number of retry attempts.
   * @returns {Promise<Response>}         - The fetch response.
   */
  async fetchWithRetry(url, options, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
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
            `Fetch failed after ${retries} attempts: ${error.message}`,
          );
          throw error;
        }
      }
    }
  }
}

/**
 * Creates and configures an API client instance.
 * @param   {object}    agent  - The HTTP agent instance.
 * @param   {object}    logger - The logger instance.
 * @returns {ApiClient}        - The configured API client instance.
 */
function createApiClient(agent, logger) {
  return new ApiClient(agent, logger);
}

/**
 * Legacy function export for backwards compatibility
 * @param   {string}                             url     - The URL to fetch
 * @param   {import('undici').RequestInit}       options - Fetch options (must include dispatcher)
 * @param   {number}                             retries - Number of retry attempts
 * @param   {import('winston').Logger}           logger  - Logger instance
 * @returns {Promise<import('undici').Response>}         - Fetch response
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
