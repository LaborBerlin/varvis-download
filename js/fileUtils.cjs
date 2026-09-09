const fs = require('node:fs');
const { once } = require('node:events');
const { finished } = require('node:stream/promises');
const ProgressBar = require('progress');
const { fetchWithRetry } = require('./apiClient.cjs');
const { getErrorMessage } = require('./errorUtils.cjs');

/**
 * Downloads a file from the given URL to the specified output path with progress reporting.
 * @param   {string}                                 url        - The URL of the file to download.
 * @param   {string}                                 outputPath - The path where the file should be saved.
 * @param   {boolean}                                overwrite  - Flag indicating whether to overwrite existing files.
 * @param   {import('./types').HttpDispatcher}       agent      - The HTTP agent instance.
 * @param   {import('node:readline').Interface|null} _rl        - Unused parameter retained for signature compatibility.
 * @param   {import('winston').Logger}               logger     - The logger instance.
 * @param   {import('./types').Metrics}              metrics    - The metrics object for tracking download stats.
 * @returns {Promise<void>}
 */
async function downloadFile(
  url,
  outputPath,
  overwrite,
  agent,
  _rl,
  logger,
  metrics,
) {
  logger.debug(`Starting download for: ${url}`);
  if (fs.existsSync(outputPath) && !overwrite) {
    logger.info(`File already exists, skipping: ${outputPath}`);
    metrics.totalFilesSkipped += 1;
    return;
  }

  const partPath = `${outputPath}.${process.pid}.part`;
  let writer;
  let response;

  try {
    // Create writer and fetch inside try block to ensure cleanup on any failure
    writer = fs.createWriteStream(partPath);
    response = await fetchWithRetry(
      url,
      { method: 'GET', dispatcher: agent },
      3,
      logger,
    );

    const startTime = Date.now();
    let totalBytes = 0;

    // Get the total size of the file for progress reporting
    const totalSize = parseInt(
      String(response.headers.get('content-length')),
      10,
    );
    const progressBar = new ProgressBar(
      '  downloading [:bar] :rate/bps :percent :etas',
      {
        complete: '=',
        incomplete: ' ',
        width: 20,
        total: totalSize,
      },
    );

    if (!response.body) {
      throw new Error(`Download response for ${url} did not include a body`);
    }

    for await (const chunk of response.body) {
      totalBytes += chunk.length;
      // Honor writable backpressure: when the internal buffer is full,
      // write() returns false — wait for 'drain' before pulling the next chunk
      // so memory stays bounded on large downloads with a slow sink.
      // events.once() rejects on 'error', so a mid-download writer failure still
      // propagates into the catch below.
      if (!writer.write(chunk)) {
        await once(writer, 'drain');
      }
      progressBar.tick(chunk.length);
    }
    writer.end();

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // in seconds
    const speed = totalBytes / duration; // bytes per second

    // Use stream/promises finished() for deterministic cleanup
    await finished(writer);

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    fs.renameSync(partPath, outputPath);

    logger.info(`Successfully downloaded ${outputPath}`);
    metrics.totalFilesDownloaded += 1;
    metrics.totalBytesDownloaded += totalBytes;
    metrics.downloadSpeeds.push(speed);
  } catch (error) {
    logger.error(
      `Download interrupted for ${outputPath}: ${getErrorMessage(error)}`,
    );
    // Properly close the write stream before cleanup using finished()
    if (writer && !writer.destroyed) {
      writer.destroy();
      try {
        await finished(writer);
      } catch {
        // Ignore errors during cleanup - stream may already be closed
      }
    }
    if (fs.existsSync(partPath)) {
      try {
        fs.unlinkSync(partPath);
      } catch (unlinkError) {
        logger.debug(
          `Could not remove partial download ${partPath}: ${getErrorMessage(unlinkError)}`,
        );
      }
    }
    throw error;
  }
}

module.exports = {
  downloadFile,
};
