const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const {
  createToolDiagnostic,
  redactToolText,
} = require('./toolDiagnostics.cjs');
const { getErrorMessage } = require('../errorUtils.cjs');

/**
 * Extracts and compresses a VCF region, waiting for every child and pipe.
 * @param   {string}                   url        - Source URL (remote or local reverse proxy).
 * @param   {string}                   range      - Genomic region.
 * @param   {string}                   outputFile - Destination for compressed records.
 * @param   {string}                   indexFile  - Local index selected explicitly, independent of the URL basename.
 * @param   {import('winston').Logger} logger     - Logger.
 * @returns {Promise<void>}                       - Completes when both tools and streams succeed.
 */
async function runVcfPipeline(url, range, outputFile, indexFile, logger) {
  /** @type {import('node:child_process').ChildProcessWithoutNullStreams[]} */
  const children = [];
  /** @type {import('node:stream').Stream[]} */
  const streams = [];
  /** @type {Promise<unknown>[]} */
  const stages = [];
  /** @type {Error|undefined} */
  let failure;

  /**
   * Stops every process and stream after the first failure.
   * @param   {unknown} error - Original failure.
   * @returns {void}          - No result.
   */
  function abort(error) {
    if (failure) return;
    failure = new Error(redactToolText(getErrorMessage(error)));
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
    for (const stream of streams) {
      if ('destroy' in stream && typeof stream.destroy === 'function')
        stream.destroy(failure);
    }
  }

  /**
   * Starts a tool and tracks close independently of stdout completion.
   * @param   {string}                                                      command   - Tool name.
   * @param   {string[]}                                                    args      - Arguments.
   * @param   {import('node:child_process').SpawnOptionsWithoutStdio}       [options] - Spawn options.
   * @returns {import('node:child_process').ChildProcessWithoutNullStreams}           - Child process.
   */
  function start(command, args, options) {
    const child = options
      ? spawn(command, args, options)
      : spawn(command, args);
    children.push(child);
    streams.push(child.stdout, child.stdin, child.stderr);
    child.stdout.on('error', abort);
    child.stdin.on('error', abort);
    const diagnostic = createToolDiagnostic();
    child.stderr.on('data', diagnostic.append);
    child.stderr.on('error', abort);
    child.on('error', abort);
    /** @type {Promise<void>} */
    const completion = new Promise((resolve, reject) => {
      child.on('close', (code, signal) => {
        const stderr = diagnostic.text();
        if (stderr) logger.debug(`[${command}] stderr: ${stderr}`);
        if (code !== 0) {
          abort(
            new Error(
              `${command} process exited with code ${code}${signal ? ` (${signal})` : ''}${stderr ? `. Stderr: ${stderr}` : ''}`,
            ),
          );
        }
        if (failure) reject(failure);
        else resolve();
      });
    });
    stages.push(completion);
    // A later synchronous setup error must not leave a rejected stage unobserved.
    completion.catch(() => {});
    return child;
  }

  try {
    logger.info(`Extracting VCF region ${range} with tabix and bgzip`);
    const tabix = start(
      'tabix',
      ['-h', `${url}##idx##${path.resolve(indexFile)}`, range],
      { cwd: path.dirname(indexFile) },
    );
    const bgzip = start('bgzip', ['-c']);
    const output = fs.createWriteStream(outputFile);
    streams.push(output);
    output.on('error', abort);
    stages.push(
      pipeline(tabix.stdout, bgzip.stdin),
      pipeline(bgzip.stdout, output),
    );
    await Promise.all(stages);
    if (failure) throw failure;
  } catch (error) {
    abort(error);
    await Promise.allSettled(stages);
    throw failure;
  }
}

module.exports = { runVcfPipeline };
