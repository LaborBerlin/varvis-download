/**
 * Array utility functions for normalizing CLI and config inputs.
 * Follows DRY principle by centralizing repeated array normalization logic.
 * @module arrayUtils
 */

/**
 * Normalizes array inputs that may contain comma-separated strings.
 * Handles both CLI arguments (which may pass comma-separated values as single strings)
 * and config file arrays. Non-string values (e.g., numbers) pass through unchanged.
 *
 * @param   {Array<string|number>|undefined} cliValue     - Value from CLI arguments.
 * @param   {Array<string|number>|undefined} configValue  - Value from config file.
 * @param   {Array<string|number>}           defaultValue - Default value if both are undefined.
 * @returns {Array<string|number>}                        - Normalized array of values.
 * @example
 * // CLI passes "id1,id2" as single array element
 * normalizeArrayInput(['id1,id2'], undefined, [])
 * // Returns: ['id1', 'id2']
 *
 * @example
 * // Config has proper array, CLI is undefined
 * normalizeArrayInput(undefined, ['id1', 'id2'], [])
 * // Returns: ['id1', 'id2']
 *
 * @example
 * // Mixed: some elements have commas, some don't
 * normalizeArrayInput(['id1,id2', 'id3'], undefined, [])
 * // Returns: ['id1', 'id2', 'id3']
 *
 * @example
 * // Numeric IDs pass through unchanged
 * normalizeArrayInput([123, 456], undefined, [])
 * // Returns: [123, 456]
 */
function normalizeArrayInput(cliValue, configValue, defaultValue = []) {
  const raw = cliValue || configValue || defaultValue;
  return raw
    .flatMap((item) =>
      typeof item === 'string' && item.includes(',')
        ? item.split(',').map((s) => s.trim())
        : item,
    )
    .filter(Boolean);
}

/**
 * Normalizes file type inputs with a specific default.
 * File types don't need the Boolean filter since empty strings are valid defaults.
 *
 * @param   {Array|undefined} cliValue    - Value from CLI arguments.
 * @param   {Array|undefined} configValue - Value from config file.
 * @returns {string[]}                    - Normalized array of file types.
 * @example
 * // Default file types when nothing specified
 * normalizeFiletypes(undefined, undefined)
 * // Returns: ['bam', 'bam.bai']
 */
function normalizeFiletypes(cliValue, configValue) {
  const defaultFiletypes = ['bam', 'bam.bai'];
  const raw = cliValue || configValue || defaultFiletypes;
  return raw.flatMap((item) =>
    typeof item === 'string' && item.includes(',')
      ? item.split(',').map((s) => s.trim())
      : item,
  );
}

module.exports = {
  normalizeArrayInput,
  normalizeFiletypes,
};
