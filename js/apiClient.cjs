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
 * Default per-attempt request timeout in milliseconds (30 seconds).
 * @type {number}
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Base delay (ms) for exponential backoff between fetch retries.
 * @type {number}
 */
const BASE_DELAY_MS = 1000;

/**
 * Error for a non-2xx HTTP response, tagging the status code and whether the
 * failure is transient (network/5xx/429) and therefore worth retrying.
 */
class HttpResponseError extends Error {
  /**
   * Creates an HttpResponseError for a failed HTTP response.
   * @param {number} status - HTTP status code of the failed response.
   */
  constructor(status) {
    super(`Fetch failed with status: ${status}`);
    this.name = 'HttpResponseError';
    /** @type {number} */
    this.status = status;
    /** @type {boolean} */
    this.retryable = status >= 500 || status === 429;
  }
}

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
   * Retries a fetch operation with a specified number of attempts, per-attempt timeouts, and jitter.
   *
   * @param   {string}                                 url     - The URL to fetch.
   * @param   {import('./types').UndiciRequestOptions} options - The fetch options.
   * @param   {number}                                 retries - The number of retry attempts.
   * @returns {Promise<import('undici').Response>}             - The fetch response.
   */
  async fetchWithRetry(url, options = {}, retries = 3) {
    const {
      timeout: rawTimeout,
      jitter: rawJitter,
      signal: callerSignal,
      ...fetchOptions
    } = options;

    const timeoutVal =
      rawTimeout !== undefined ? rawTimeout : DEFAULT_REQUEST_TIMEOUT_MS;
    const isTimeoutEnabled =
      timeoutVal !== 0 && timeoutVal !== null && typeof timeoutVal === 'number';
    const isJitterEnabled = rawJitter !== false;

    // fail fast if caller already aborted
    if (callerSignal?.aborted) {
      throw callerSignal.reason ?? new Error('Operation aborted');
    }

    if (retries <= 0) {
      throw new Error('Fetch failed without executing a request');
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      // abort fast on each iteration if caller signaled cancellation
      if (callerSignal?.aborted) {
        throw callerSignal.reason ?? new Error('Operation aborted');
      }

      // configure fresh per-attempt signal
      /** @type {AbortSignal|undefined} */
      let attemptSignal;
      if (isTimeoutEnabled) {
        const timeoutSignal = AbortSignal.timeout(timeoutVal);
        attemptSignal = callerSignal
          ? AbortSignal.any([callerSignal, timeoutSignal])
          : timeoutSignal;
      } else {
        attemptSignal = callerSignal ?? undefined;
      }

      /** @type {import('undici').Response | undefined} */
      let response;
      try {
        response = await fetch(url, {
          ...fetchOptions,
          headers: { ...DEFAULT_HEADERS, ...fetchOptions.headers },
          dispatcher: this.agent,
          ...(attemptSignal ? { signal: attemptSignal } : {}),
        });
        if (!response.ok) {
          // drain or cancel unconsumed response body to release undici socket
          if (response.body) {
            try {
              const body =
                /** @type {{ cancel?: () => Promise<void>, dump?: () => Promise<void> }} */ (
                  response.body
                );
              if (typeof body.cancel === 'function') {
                await body.cancel();
              } else if (typeof body.dump === 'function') {
                await body.dump();
              }
            } catch {
              // ignore body cancel errors
            }
          }
          throw new HttpResponseError(response.status);
        }

        // buffer body under attemptSignal for requests with timeout
        if (
          isTimeoutEnabled &&
          response.body &&
          typeof response.text === 'function'
        ) {
          const rawText = await response.text();
          Object.defineProperty(response, 'text', {
            value: async () => rawText,
            configurable: true,
            writable: true,
          });
          Object.defineProperty(response, 'json', {
            value: async () => JSON.parse(rawText),
            configurable: true,
            writable: true,
          });
        }

        return response;
      } catch (error) {
        // fail immediately on caller cancellation without retry
        if (callerSignal?.aborted) {
          throw error;
        }

        // Network errors (plain Error) are transient; only HttpResponseError
        // for a permanent 4xx (retryable === false) short-circuits the retries.
        const isRetryable =
          !(error instanceof HttpResponseError) || error.retryable;
        if (isRetryable && attempt < retries) {
          this.logger.warn(`Fetch attempt ${attempt} failed. Retrying...`);
          // Exponential backoff with optional decorrelated equal jitter
          const nominalBackoff = 2 ** (attempt - 1) * BASE_DELAY_MS;
          const delay = isJitterEnabled
            ? Math.round(
                nominalBackoff * 0.5 + Math.random() * (nominalBackoff * 0.5),
              )
            : nominalBackoff;

          // interruptible delay if caller cancels mid-backoff
          await new Promise(
            (/** @type {(value?: void) => void} */ res, rej) => {
              const timer = setTimeout(() => {
                if (callerSignal)
                  callerSignal.removeEventListener('abort', onAbort);
                res();
              }, delay);
              const onAbort = () => {
                clearTimeout(timer);
                rej(callerSignal?.reason ?? new Error('Operation aborted'));
              };
              if (callerSignal) {
                if (callerSignal.aborted) {
                  clearTimeout(timer);
                  return rej(
                    callerSignal.reason ?? new Error('Operation aborted'),
                  );
                }
                callerSignal.addEventListener('abort', onAbort, { once: true });
              }
            },
          );
        } else {
          this.logger.error(
            `Fetch failed after ${attempt} attempt${attempt === 1 ? '' : 's'}: ${getErrorMessage(error)}`,
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
  HttpResponseError,
  createApiClient,
  fetchWithRetry,
};
