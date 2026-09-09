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
  if (fs.existsSync(outputPath)) {
    if (fs.statSync(outputPath).isDirectory()) {
      throw Object.assign(
        new Error(
          `EISDIR: illegal operation on a directory, open '${outputPath}'`,
        ),
        { code: 'EISDIR' },
      );
    }
    if (!overwrite) {
      logger.info(`File already exists, skipping: ${outputPath}`);
      metrics.totalFilesSkipped += 1;
      return;
    }
  }

  const partPath = `${outputPath}.${process.pid}.part`;
  let writer;
  let response;
  let downloadCompleted = false;
  const downloadController = new AbortController();

  try {
    // Create writer and fetch inside try block to ensure cleanup on any failure
    writer = fs.createWriteStream(partPath);
    /** @type {Error|null} */
    let writerError = null;
    writer.on('error', (err) => {
      writerError = err;
      downloadController.abort(err);
    });

    if (writerError) {
      throw writerError;
    }

    response = await fetchWithRetry(
      url,
      {
        method: 'GET',
        dispatcher: agent,
        timeout: 0,
        signal: downloadController.signal,
      },
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
      if (writerError) {
        throw writerError;
      }
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
    downloadCompleted = true;

    // Transactional replacement on overwrite
    if (fs.existsSync(outputPath)) {
      if (fs.statSync(outputPath).isDirectory()) {
        throw Object.assign(
          new Error(
            `EISDIR: illegal operation on a directory, open '${outputPath}'`,
          ),
          { code: 'EISDIR' },
        );
      }
      const backupPath = `${outputPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.bak`;
      // stage: move existing file to unique backup
      fs.renameSync(outputPath, backupPath);
      try {
        // commit: move completed part to final destination
        fs.renameSync(partPath, outputPath);
      } catch (commitError) {
        // rollback: restore original file from backup
        try {
          fs.renameSync(backupPath, outputPath);
          logger.error(
            `Failed to replace ${outputPath} with ${partPath}: ${getErrorMessage(commitError)}. Original destination restored; completed download preserved at ${partPath}`,
          );
        } catch (rollbackError) {
          logger.error(
            `CRITICAL: Replacement and rollback both failed for ${outputPath}. Backup preserved at ${backupPath}; completed download preserved at ${partPath}: ${getErrorMessage(rollbackError)}`,
          );
        }
        throw commitError;
      }
      // cleanup: remove backup after successful commit
      try {
        fs.unlinkSync(backupPath);
      } catch (unlinkError) {
        logger.debug(
          `Could not remove temporary backup ${backupPath}: ${getErrorMessage(unlinkError)}`,
        );
      }
    } else {
      fs.renameSync(partPath, outputPath);
    }

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
    // Only remove .part if the download failed mid-flight before completion.
    // If downloadCompleted is true, the failure occurred during the replace phase,
    // so we preserve the completed .part file for recovery.
    if (!downloadCompleted && fs.existsSync(partPath)) {
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
