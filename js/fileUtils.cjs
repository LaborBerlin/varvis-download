const fs = require('node:fs');
const { finished } = require('node:stream/promises');
const ProgressBar = require('progress');
const { fetchWithRetry } = require('./apiClient.cjs');

/**
 * Prompts the user to confirm file overwrite if the file already exists.
 * @param   {string}                   file    - The file path.
 * @param   {object}                   rl      - The readline interface instance.
 * @param   {import('winston').Logger} _logger - The logger instance (unused).
 * @returns {Promise<boolean>}                 - True if the user confirms overwrite, otherwise false.
 */
async function confirmOverwrite(file, rl, _logger) {
  return new Promise((resolve) => {
    rl.question(`File ${file} already exists. Overwrite? (y/n): `, (answer) => {
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Downloads a file from the given URL to the specified output path with progress reporting.
 * @param   {string}        url        - The URL of the file to download.
 * @param   {string}        outputPath - The path where the file should be saved.
 * @param   {boolean}       overwrite  - Flag indicating whether to overwrite existing files.
 * @param   {object}        agent      - The HTTP agent instance.
 * @param   {object}        rl         - The readline interface instance.
 * @param   {object}        logger     - The logger instance.
 * @param   {object}        metrics    - The metrics object for tracking download stats.
 * @returns {Promise<void>}
 */
async function downloadFile(
  url,
  outputPath,
  overwrite,
  agent,
  rl,
  logger,
  metrics,
) {
  logger.debug(`Starting download for: ${url}`);
  if (fs.existsSync(outputPath) && !overwrite) {
    logger.info(`File already exists, skipping: ${outputPath}`);
    metrics.totalFilesSkipped += 1;
    return;
  }

  let writer;
  let response;

  try {
    // Create writer and fetch inside try block to ensure cleanup on any failure
    writer = fs.createWriteStream(outputPath);
    response = await fetchWithRetry(
      url,
      { method: 'GET', dispatcher: agent },
      3,
      logger,
    );

    const startTime = Date.now();
    let totalBytes = 0;

    // Get the total size of the file for progress reporting
    const totalSize = parseInt(response.headers.get('content-length'), 10);
    const progressBar = new ProgressBar(
      '  downloading [:bar] :rate/bps :percent :etas',
      {
        complete: '=',
        incomplete: ' ',
        width: 20,
        total: totalSize,
      },
    );

    for await (const chunk of response.body) {
      totalBytes += chunk.length;
      writer.write(chunk);
      progressBar.tick(chunk.length);
    }
    writer.end();

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // in seconds
    const speed = totalBytes / duration; // bytes per second

    // Use stream/promises finished() for deterministic cleanup
    await finished(writer);

    logger.info(`Successfully downloaded ${outputPath}`);
    metrics.totalFilesDownloaded += 1;
    metrics.totalBytesDownloaded += totalBytes;
    metrics.downloadSpeeds.push(speed);
  } catch (error) {
    logger.error(`Download interrupted for ${outputPath}: ${error.message}`);
    // Properly close the write stream before cleanup using finished()
    if (writer && !writer.destroyed) {
      writer.destroy();
      try {
        await finished(writer);
      } catch {
        // Ignore errors during cleanup - stream may already be closed
      }
    }
    try {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath); // Clean up partial download
      }
    } catch (unlinkError) {
      logger.debug(
        `Could not remove partial download ${outputPath}: ${unlinkError.message}`,
      );
    }
    throw error;
  }
}

module.exports = {
  confirmOverwrite,
  downloadFile,
};
