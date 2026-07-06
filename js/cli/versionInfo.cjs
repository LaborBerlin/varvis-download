/**
 * @typedef {object} VersionInfo
 * @property {string}        name         - Package name.
 * @property {string}        version      - Package version.
 * @property {string}        author       - Package author.
 * @property {string}        license      - SPDX license identifier.
 * @property {{url: string}} repository   - package.json repository field.
 * @property {string}        lastModified - Last modified date for the entry file.
 * @property {string}        logo         - Logo text to print first.
 */

/**
 * Formats version output for the --version flag.
 *
 * @param   {VersionInfo} info - Version information.
 * @returns {string}           - Multi-line version banner.
 */
function formatVersionInfo({
  name,
  version,
  author,
  license,
  repository,
  lastModified,
  logo,
}) {
  return [
    logo,
    `${name} - Version ${version}`,
    `Date Last Modified: ${lastModified}`,
    `Author: ${author}`,
    `Repository: ${repository.url}`,
    `License: ${license}`,
  ].join('\n');
}

module.exports = { formatVersionInfo };
