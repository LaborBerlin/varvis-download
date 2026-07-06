const { fetch } = require('undici');

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
 * AuthService class handles authentication with the Varvis API.
 */
class AuthService {
  /**
   * Creates an instance of AuthService.
   * @param {import('winston').Logger}         logger - The logger instance.
   * @param {import('./types').HttpDispatcher} agent  - The HTTP agent instance.
   */
  constructor(logger, agent) {
    this.logger = logger;
    this.agent = agent;
    this.token = '';
  }

  /**
   * Fetches the CSRF token required for login.
   * @param   {string}          target - The target for the Varvis API.
   * @returns {Promise<string>}        - The CSRF token.
   */
  async getCsrfToken(target) {
    try {
      this.logger.debug(
        `Fetching CSRF token from https://${target}.varvis.com/authenticate`,
      );
      const response = await fetch(
        `https://${target}.varvis.com/authenticate`,
        {
          method: 'HEAD',
          headers: { ...DEFAULT_HEADERS },
          dispatcher: this.agent,
        },
      );
      const csrfToken = response.headers.get('x-csrf-token');
      if (!csrfToken) {
        throw new Error('CSRF token missing from authentication response');
      }
      this.logger.debug(`Received CSRF token: ${csrfToken}`);
      return csrfToken;
    } catch (error) {
      this.logger.error('Error fetching initial CSRF token:', error);
      throw error;
    }
  }

  /**
   * Logs in to the Varvis API and retrieves the CSRF token.
   * @param   {import('./types').Credentials}          user   - The user credentials.
   * @param   {string}                                 target - The target for the Varvis API.
   * @returns {Promise<import('./types').LoginResult>}        - The login response containing the CSRF token.
   */
  async login(user, target) {
    try {
      const csrfToken1 = await this.getCsrfToken(target);

      const params = new URLSearchParams();
      params.append('_csrf', csrfToken1);
      params.append('username', user.username);
      params.append('password', user.password);

      this.logger.debug(
        `Logging in to https://${target}.varvis.com/login with username: ${user.username}`,
      );
      const loginResponse = await fetch(`https://${target}.varvis.com/login`, {
        method: 'POST',
        headers: {
          ...DEFAULT_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
        dispatcher: this.agent,
      });

      if (loginResponse.status !== 200) {
        this.logger.debug(
          `Login response status: ${loginResponse.status}, redirected: ${loginResponse.redirected}`,
        );
        throw new Error(`Login failed with status ${loginResponse.status}`);
      }

      const csrfToken2Response = await fetch(
        `https://${target}.varvis.com/authenticate`,
        {
          method: 'HEAD',
          headers: { ...DEFAULT_HEADERS },
          dispatcher: this.agent,
        },
      );

      const csrfToken2 = csrfToken2Response.headers.get('x-csrf-token');
      if (!csrfToken2) {
        throw new Error(
          'CSRF token missing from post-login authentication response',
        );
      }
      this.token = csrfToken2;

      this.logger.info('Login successful');
      return { csrfToken: this.token };
    } catch (error) {
      this.logger.error('Login error:', error);
      throw error;
    }
  }
}

module.exports = AuthService;
