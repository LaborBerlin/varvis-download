/**
 * Error thrown when user-provided configuration is invalid.
 */
class ConfigurationError extends Error {
  /**
   * Creates a configuration error.
   * @param {string} message - The validation message to show to the user.
   */
  constructor(message) {
    super(message);
    this.name = 'ConfigurationError';
    this.exitCode = 1;
  }
}

/**
 * Error thrown for operational failures after configuration has been accepted.
 */
class OperationalError extends Error {
  /**
   * Creates an operational error.
   * @param {string} message      - The failure message to show to the user.
   * @param {number} [exitCode=1] - Process exit code for the failure.
   */
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'OperationalError';
    this.exitCode = exitCode;
  }
}

module.exports = {
  ConfigurationError,
  OperationalError,
};
