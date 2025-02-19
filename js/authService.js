const { fetch } = require("undici");

/**
 * AuthService class handles authentication with the Varvis API.
 */
class AuthService {
  /**
   * Creates an instance of AuthService.
   * @param {Object} logger - The logger instance.
   * @param {Object} agent - The HTTP agent instance.
   */
  constructor(logger, agent) {
    this.logger = logger;
    this.agent = agent;
    this.token = "";
  }

  /**
   * Fetches the CSRF token required for login.
   * @param {string} target - The target for the Varvis API.
   * @returns {Promise<string>} - The CSRF token.
   */
  async getCsrfToken(target) {
    try {
      this.logger.debug(
        `Fetching CSRF token from https://${target}.varvis.com/authenticate`,
      );
      const response = await fetch(
        `https://${target}.varvis.com/authenticate`,
        {
          method: "HEAD",
          dispatcher: this.agent,
        },
      );
      const csrfToken = response.headers.get("x-csrf-token");
      this.logger.debug(`Received CSRF token: ${csrfToken}`);
      return csrfToken;
    } catch (error) {
      this.logger.error("Error fetching initial CSRF token:", error);
      throw error;
    }
  }

  /**
   * Logs in to the Varvis API and retrieves the CSRF token.
   * @param {Object} user - The user credentials.
   * @param {string} user.username - The username.
   * @param {string} user.password - The password.
   * @param {string} target - The target for the Varvis API.
   * @returns {Promise<Object>} - The login response containing the CSRF token.
   */
  async login(user, target) {
    try {
      const csrfToken1 = await this.getCsrfToken(target);

      const params = new URLSearchParams();
      params.append("_csrf", csrfToken1);
      params.append("username", user.username);
      params.append("password", user.password);

      this.logger.debug(
        `Logging in to https://${target}.varvis.com/login with username: ${user.username}`,
      );
      const loginResponse = await fetch(`https://${target}.varvis.com/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
        dispatcher: this.agent,
      });

      if (loginResponse.status !== 200) {
        throw new Error("Login failed");
      }

      const csrfToken2Response = await fetch(
        `https://${target}.varvis.com/authenticate`,
        {
          method: "HEAD",
          dispatcher: this.agent,
        },
      );

      this.token = csrfToken2Response.headers.get("x-csrf-token");

      this.logger.info("Login successful");
      return { csrfToken: this.token };
    } catch (error) {
      this.logger.error("Login error:", error);
      throw error;
    }
  }
}

module.exports = AuthService;
