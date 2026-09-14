const MAX_DIAGNOSTIC_LENGTH = 8192;

/**
 * Redacts complete URLs before diagnostic text leaves the process boundary.
 * @param   {string} value - Tool output or command text.
 * @returns {string}       - Text without remote URLs or their credentials.
 */
function redactToolText(value) {
  return value.replace(/https?:\/\/[^\s"'<>]*/gi, '[redacted URL]');
}

/**
 * Collects a bounded prefix, redacting only after chunks have been joined.
 * @returns {{append: (chunk: Buffer|string) => void, text: () => string}} - Diagnostic collector.
 */
function createToolDiagnostic() {
  let value = '';
  return {
    append(chunk) {
      value += chunk.toString().slice(0, MAX_DIAGNOSTIC_LENGTH - value.length);
    },
    text() {
      return redactToolText(value).trim();
    },
  };
}

module.exports = { createToolDiagnostic, redactToolText };
