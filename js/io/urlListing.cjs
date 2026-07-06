const fs = require('node:fs');

const { getErrorMessage } = require('../errorUtils.cjs');

/**
 * Handles the output of download URLs, printing to console and/or writing to a file.
 * @param   {string[]}                 urls     - An array of URL strings to output.
 * @param   {string|null}              filePath - The path to the output file, or null to only use console.
 * @param   {import('winston').Logger} logger   - The logger instance.
 * @returns {void}
 */
function handleUrlListing(urls, filePath, logger) {
  if (urls.length === 0) {
    logger.info('No files matching the criteria were found. No URLs to list.');
    return;
  }

  const urlOutput = urls.join('\n');

  // Always print to console. We use console.log directly to ensure clean output for piping.
  console.log(urlOutput);

  if (filePath) {
    try {
      fs.writeFileSync(filePath, `${urlOutput}\n`);
      logger.info(`Successfully saved ${urls.length} URLs to ${filePath}`);
    } catch (error) {
      logger.error(
        `Failed to write URLs to file ${filePath}: ${getErrorMessage(error)}`,
      );
    }
  }
}

module.exports = { handleUrlListing };
