/**
 * Returns a readable message for an unknown thrown value.
 * @param   {unknown} error - The thrown value.
 * @returns {string}        - A message suitable for logs.
 */
function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string') {
      return message;
    }
  }

  return String(error);
}

/**
 * Returns the stack trace from an Error value when available.
 * @param   {unknown}          error - The thrown value.
 * @returns {string|undefined}       - The stack trace, if the value is an Error.
 */
function getErrorStack(error) {
  return error instanceof Error ? error.stack : undefined;
}

module.exports = {
  getErrorMessage,
  getErrorStack,
};
