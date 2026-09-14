/* global AbortController */
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const { URL } = require('node:url');
const { once } = require('node:events');
const { request } = require('undici');
const {
  DEFAULT_CHUNK_SIZE,
  validateChunkSize,
  isStrongEtag,
  RangeProtocolError,
  parseRange,
  validateResponse,
} = require('./rangeProtocol.cjs');

/**
 * @typedef {object} BoundedRangeProxyOptions
 * @property {number} [chunkSize=2097152] - Maximum upstream range size.
 * @property {Pick<import('winston').Logger, 'debug' | 'error'>} [logger] - Optional logger.
 * @property {import('../types').HttpDispatcher} [dispatcher] - Caller-owned upstream dispatcher.
 */

/**
 * @typedef {object} ProxyMetrics
 * @property {number} totalChunksFetched - Upstream range requests attempted.
 * @property {number} upstreamBytesRead - Raw upstream body bytes consumed.
 * @property {number} totalBytesServed - Bytes written into downstream responses.
 * @property {number} upstreamRequestedBytes - Sum of requested bounded span lengths.
 */

/**
 * @typedef {object} BoundedRangeProxyInstance
 * @property {string} proxyUrl - Loopback URL preserving the source basename.
 * @property {string} token - Random route authorization token.
 * @property {() => Promise<void>} close - Aborts requests and closes the server.
 * @property {() => ProxyMetrics} getMetrics - Copies observed transfer counters.
 */

/**
 * Creates a loopback server that streams complete responses from bounded upstream requests.
 * @param   {string}                             targetUrl - Signed upstream GET URL.
 * @param   {BoundedRangeProxyOptions}           [options] - Proxy options.
 * @returns {Promise<BoundedRangeProxyInstance>}           - Server controller and observed transfer counters.
 */
async function createBoundedRangeProxy(targetUrl, options = {}) {
  if (typeof targetUrl !== 'string' || targetUrl.trim() === '')
    throw new TypeError('targetUrl must be a non-empty string');
  const target = new URL(targetUrl);
  if (!['http:', 'https:'].includes(target.protocol))
    throw new TypeError('targetUrl must use HTTP or HTTPS');
  const chunkSize = validateChunkSize(
    options.chunkSize === undefined ? DEFAULT_CHUNK_SIZE : options.chunkSize,
  );
  const token = crypto.randomUUID();
  const filename = path.posix.basename(target.pathname) || 'data';
  const route = `/stream/${token}/${filename}`;
  /** @type {Set<AbortController>} */
  const controllers = new Set();
  const metrics = {
    totalChunksFetched: 0,
    upstreamBytesRead: 0,
    totalBytesServed: 0,
    upstreamRequestedBytes: 0,
  };
  /** @type {{size?: number, etag?: string}} */
  const object = {};

  /**
   * Requests and validates one bounded range, leaving the body for its consumer.
   * @param   {number}                                                                                   start  - First byte.
   * @param   {number}                                                                                   end    - Last byte.
   * @param   {AbortSignal}                                                                              signal - Downstream cancellation signal.
   * @returns {Promise<{upstream: import('undici').Dispatcher.ResponseData, size: number, end: number}>}        - Validated range.
   */
  async function getChunk(start, end, signal) {
    signal.throwIfAborted();
    if (object.size !== undefined && !isStrongEtag(object.etag)) {
      throw new RangeProtocolError(
        'A strong ETag is required for additional range requests',
      );
    }
    metrics.totalChunksFetched++;
    metrics.upstreamRequestedBytes += end - start + 1;
    const upstream = await request(targetUrl, {
      method: 'GET',
      headers: {
        range: `bytes=${start}-${end}`,
        'accept-encoding': 'identity',
        ...(isStrongEtag(object.etag) ? { 'if-match': object.etag } : {}),
      },
      dispatcher: options.dispatcher,
      signal,
      headersTimeout: 15000,
      bodyTimeout: 15000,
    });
    // Rejected responses must still have their body destroyed without an unhandled error.
    upstream.body.on('error', () => {});
    try {
      const metadata = validateResponse(upstream, start, end, object);
      object.size = metadata.size;
      object.etag = metadata.etag;
      return { upstream, size: metadata.size, end: metadata.end };
    } catch (error) {
      upstream.body.destroy();
      throw error;
    }
  }

  /**
   * Reads a chunk under backpressure and verifies its complete body length.
   * @param   {Awaited<ReturnType<typeof getChunk>>} chunk        - Validated range.
   * @param   {number}                               start        - First byte.
   * @param   {AbortSignal}                          signal       - Cancellation signal.
   * @param   {import('node:http').ServerResponse}   [downstream] - Omit for metadata probes.
   * @returns {Promise<void>}                                     - Resolves after complete validated consumption.
   */
  async function consumeChunk(chunk, start, signal, downstream) {
    const expected = chunk.end - start + 1;
    let received = 0;
    /** @type {Buffer | undefined} */
    let lastByte;
    /**
     * Writes bytes after respecting downstream backpressure.
     * @param   {Buffer}        bytes - Bytes to write.
     * @returns {Promise<void>}       - Resolves after backpressure.
     */
    const write = async (bytes) => {
      if (!downstream || bytes.length === 0) return;
      signal.throwIfAborted();
      metrics.totalBytesServed += bytes.length;
      if (!downstream.write(bytes)) await once(downstream, 'drain', { signal });
    };
    for await (const bytes of chunk.upstream.body) {
      signal.throwIfAborted();
      received += bytes.length;
      metrics.upstreamBytesRead += bytes.length;
      if (received > expected)
        throw new RangeProtocolError('Upstream exceeded requested range');
      // Keep the final byte until EOF validation so incomplete framing cannot look complete.
      if (received === expected) {
        lastByte = bytes.subarray(bytes.length - 1);
        await write(bytes.subarray(0, bytes.length - 1));
      } else await write(bytes);
    }
    if (received !== expected)
      throw new RangeProtocolError('Truncated upstream chunk');
    if (lastByte) await write(lastByte);
  }

  const server = http.createServer(async (incoming, downstream) => {
    if (incoming.url?.split('?')[0] !== route) {
      downstream.writeHead(403).end();
      return;
    }
    if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
      downstream.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    controllers.add(controller);
    const abort = () => controller.abort();
    downstream.on('close', abort);
    incoming.on('aborted', abort);
    /** @type {Awaited<ReturnType<typeof getChunk>> | undefined} */
    let current;
    const head = incoming.method === 'HEAD';
    const range = head ? undefined : incoming.headers.range;
    try {
      const span = parseRange(range);
      let start = span.start;
      if (span.suffix !== undefined) {
        if (object.size === undefined) {
          current = await getChunk(0, 0, signal);
          await consumeChunk(current, 0, signal);
        }
        start = Math.max(0, (object.size ?? 0) - span.suffix);
      }
      const boundedEnd = Math.min(
        span.end ?? Number.MAX_SAFE_INTEGER,
        start + Math.min(chunkSize - 1, Number.MAX_SAFE_INTEGER - start),
      );
      current = await getChunk(start, head ? 0 : boundedEnd, signal);
      const finalEnd = Math.min(span.end ?? current.size - 1, current.size - 1);
      if (!head && finalEnd > current.end && !isStrongEtag(object.etag)) {
        throw new RangeProtocolError(
          'A strong ETag is required to combine upstream ranges',
        );
      }
      const contentType = current.upstream.headers['content-type'];
      if (head) await consumeChunk(current, 0, signal);
      downstream.writeHead(range === undefined ? 200 : 206, {
        'content-length': head ? current.size : finalEnd - start + 1,
        'accept-ranges': 'bytes',
        'content-type':
          typeof contentType === 'string'
            ? contentType
            : 'application/octet-stream',
        ...(range !== undefined
          ? { 'content-range': `bytes ${start}-${finalEnd}/${current.size}` }
          : {}),
        ...(object.etag ? { etag: object.etag } : {}),
      });
      if (!head) {
        while (true) {
          await consumeChunk(current, start, signal, downstream);
          start = current.end + 1;
          if (start > finalEnd) break;
          current = await getChunk(
            start,
            Math.min(
              finalEnd,
              start + Math.min(chunkSize - 1, Number.MAX_SAFE_INTEGER - start),
            ),
            signal,
          );
        }
      }
      downstream.end();
    } catch (error) {
      if (!signal.aborted && !downstream.destroyed) {
        if (downstream.headersSent) downstream.destroy();
        else if (
          error instanceof RangeProtocolError &&
          error.status === 416 &&
          error.size === 0 &&
          range === undefined
        ) {
          object.size = 0;
          downstream
            .writeHead(200, { 'content-length': '0', 'accept-ranges': 'bytes' })
            .end();
        } else {
          const status =
            error instanceof RangeProtocolError ? error.status : 502;
          const size =
            error instanceof RangeProtocolError ? error.size : undefined;
          downstream
            .writeHead(
              status,
              size !== undefined ? { 'content-range': `bytes */${size}` } : {},
            )
            .end();
          // Transport errors may contain signed URLs; only log a fixed diagnostic.
          if (status === 502)
            options.logger?.error(
              'Bounded range proxy upstream request failed',
            );
        }
      }
    } finally {
      current?.upstream.body.destroy();
      controller.abort();
      controllers.delete(controller);
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Failed to obtain proxy address');
  /** @type {Promise<void> | undefined} */
  let closing;
  return {
    proxyUrl: `http://127.0.0.1:${address.port}${route}`,
    token,
    getMetrics: () => ({ ...metrics }),
    close: () =>
      (closing ??= (async () => {
        for (const controller of controllers) controller.abort();
        /** @type {Promise<void>} */
        const closed = new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        server.closeAllConnections();
        await closed;
      })()),
  };
}

module.exports = { createBoundedRangeProxy };
