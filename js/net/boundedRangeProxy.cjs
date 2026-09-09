/* global fetch, AbortController */

const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { Readable, pipeline } = require('node:stream');

/**
 * Default chunk size (2 MiB).
 */
const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024;

/**
 * @typedef {object} BoundedRangeProxyOptions
 * @property {number} [chunkSize=2097152] - Maximum bytes to request per bounded range chunk.
 * @property {any}    [logger]            - Optional logger instance with debug, info, warn, error methods.
 */

/**
 * @typedef {object} ProxyMetrics
 * @property {number} totalBytesServed   - Total number of bytes served downstream.
 * @property {number} totalChunksFetched - Total number of range chunks fetched from upstream.
 */

/**
 * @typedef {object} BoundedRangeProxyInstance
 * @property {string}              proxyUrl   - Local loopback URL for samtools/tabix to query.
 * @property {string}              token      - Cryptographically random UUID token for route authorization.
 * @property {() => Promise<void>} close      - Closes the proxy server and terminates active upstream requests.
 * @property {() => ProxyMetrics}  getMetrics - Returns current data transfer and request metrics.
 */

/**
 * @typedef {object} ProxyLogger
 * @property {(...args: any[]) => void} debug - Log debug message.
 * @property {(...args: any[]) => void} info  - Log info message.
 * @property {(...args: any[]) => void} warn  - Log warn message.
 * @property {(...args: any[]) => void} error - Log error message.
 */

/**
 * Normalizes an optional logger into an object with debug, info, warn, and error methods.
 *
 * @param   {any}         [logger] - Optional logger or console-like object.
 * @returns {ProxyLogger}          - Normalized logger.
 */
function normalizeLogger(logger) {
  const noop = () => {};
  return {
    debug:
      typeof logger?.debug === 'function' ? logger.debug.bind(logger) : noop,
    info: typeof logger?.info === 'function' ? logger.info.bind(logger) : noop,
    warn: typeof logger?.warn === 'function' ? logger.warn.bind(logger) : noop,
    error:
      typeof logger?.error === 'function' ? logger.error.bind(logger) : noop,
  };
}

/**
 * Computes a bounded range string for the upstream request.
 *
 * @param   {string | undefined} rangeHeader - Incoming Range header.
 * @param   {number}             chunkSize   - Maximum chunk size in bytes.
 * @returns {string}                         - Bounded Range header value.
 */
function computeBoundedRange(rangeHeader, chunkSize) {
  if (!rangeHeader) {
    return `bytes=0-${chunkSize - 1}`;
  }

  const trimmed = rangeHeader.trim();
  if (!trimmed.startsWith('bytes=')) {
    return rangeHeader;
  }

  const parts = trimmed.slice(6).split('-');
  if (parts.length !== 2 || !/^\d+$/.test(parts[0])) {
    return rangeHeader;
  }

  const start = Number.parseInt(parts[0], 10);
  if (parts[1] === '') {
    const end = start + chunkSize - 1;
    return `bytes=${start}-${end}`;
  }

  if (!/^\d+$/.test(parts[1])) {
    return rangeHeader;
  }

  const end = Number.parseInt(parts[1], 10);
  const clampedEnd = Math.min(end, start + chunkSize - 1);
  return `bytes=${start}-${clampedEnd}`;
}

/**
 * Creates an in-process bounded-range reverse proxy for remote ranged downloads.
 *
 * @param   {string}                             targetUrl - Upstream target URL (e.g. presigned S3 URL).
 * @param   {BoundedRangeProxyOptions}           [options] - Proxy configuration options.
 * @returns {Promise<BoundedRangeProxyInstance>}           - Proxy instance controller.
 */
async function createBoundedRangeProxy(targetUrl, options = {}) {
  if (typeof targetUrl !== 'string' || targetUrl.trim() === '') {
    throw new TypeError('targetUrl must be a non-empty string');
  }

  const chunkSize =
    typeof options.chunkSize === 'number' && options.chunkSize > 0
      ? options.chunkSize
      : DEFAULT_CHUNK_SIZE;

  const log = normalizeLogger(options.logger);
  const token = crypto.randomUUID();

  let totalBytesServed = 0;
  let totalChunksFetched = 0;

  /** @type {Set<AbortController>} */
  const activeAbortControllers = new Set();
  /** @type {Set<import('node:net').Socket>} */
  const activeSockets = new Set();

  const server = http.createServer(async (req, res) => {
    const host = req.headers.host || '127.0.0.1';
    const parsedUrl = new URL(req.url || '/', `http://${host}`);

    if (parsedUrl.pathname !== `/stream/${token}`) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    const abortController = new AbortController();
    activeAbortControllers.add(abortController);

    let finished = false;
    const cleanup = () => {
      activeAbortControllers.delete(abortController);
    };

    const onClose = () => {
      if (!finished) {
        abortController.abort();
      }
      cleanup();
    };

    res.on('finish', () => {
      finished = true;
      cleanup();
    });
    res.on('close', onClose);
    req.on('close', onClose);

    if (req.method === 'HEAD') {
      let upstreamRes;
      try {
        upstreamRes = await fetch(targetUrl, {
          method: 'HEAD',
          signal: abortController.signal,
        });
      } catch (err) {
        if (abortController.signal.aborted) {
          return;
        }
        log.error(
          `Upstream HEAD error: ${err instanceof Error ? err.message : String(err)}`,
        );
        if (!res.headersSent) {
          res.writeHead(502, { 'content-type': 'text/plain' });
          res.end('Bad Gateway');
        }
        return;
      }

      /** @type {Record<string, string>} */
      const forwardHeaders = {};
      const cl = upstreamRes.headers.get('content-length');
      if (cl) forwardHeaders['content-length'] = cl;
      const ar = upstreamRes.headers.get('accept-ranges');
      if (ar) forwardHeaders['accept-ranges'] = ar;
      const ct = upstreamRes.headers.get('content-type');
      if (ct) forwardHeaders['content-type'] = ct;

      res.writeHead(upstreamRes.status, forwardHeaders);
      res.end();
      return;
    }

    // Handle GET request
    const rangeHeader = req.headers.range;
    const upstreamRange = computeBoundedRange(rangeHeader, chunkSize);

    totalChunksFetched += 1;

    let upstreamRes;
    try {
      upstreamRes = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          range: upstreamRange,
        },
        signal: abortController.signal,
      });
    } catch (err) {
      if (abortController.signal.aborted) {
        log.debug('Upstream GET request aborted');
        return;
      }
      log.error(
        `Upstream GET error: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain' });
        res.end('Bad Gateway');
      }
      return;
    }

    /** @type {Record<string, string>} */
    const forwardHeaders = {};
    const cl = upstreamRes.headers.get('content-length');
    if (cl) forwardHeaders['content-length'] = cl;
    const cr = upstreamRes.headers.get('content-range');
    if (cr) forwardHeaders['content-range'] = cr;
    const ct = upstreamRes.headers.get('content-type');
    if (ct) forwardHeaders['content-type'] = ct;
    forwardHeaders['accept-ranges'] =
      upstreamRes.headers.get('accept-ranges') || 'bytes';

    res.writeHead(upstreamRes.status, forwardHeaders);

    if (upstreamRes.body) {
      const nodeStream = Readable.fromWeb(
        /** @type {import('node:stream/web').ReadableStream} */ (
          upstreamRes.body
        ),
      );

      nodeStream.on('data', (chunk) => {
        totalBytesServed += chunk.length;
      });

      pipeline(nodeStream, res, (err) => {
        if (err) {
          const errCode = /** @type {{ code?: string }} */ (err).code;
          if (
            err.name === 'AbortError' ||
            errCode === 'ABORT_ERR' ||
            errCode === 'ERR_STREAM_PREMATURE_CLOSE'
          ) {
            log.debug('Streaming ended early or aborted');
          } else {
            log.warn(`Streaming pipeline error: ${err.message}`);
          }
        }
      });
    } else {
      res.end();
    }
  });

  server.on('connection', (socket) => {
    activeSockets.add(socket);
    socket.on('close', () => {
      activeSockets.delete(socket);
    });
  });

  /** @type {Promise<void>} */
  const listenPromise = new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
    server.on('error', reject);
  });
  await listenPromise;

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to obtain server address');
  }

  const proxyUrl = `http://127.0.0.1:${addr.port}/stream/${token}`;

  let isClosed = false;
  /**
   * Closes the proxy server and aborts any in-flight upstream requests.
   *
   * @returns {Promise<void>} Resolves when server is closed.
   */
  const close = async () => {
    if (isClosed) {
      return;
    }

    for (const ac of activeAbortControllers) {
      ac.abort();
    }
    activeAbortControllers.clear();

    if (typeof server.closeIdleConnections === 'function') {
      server.closeIdleConnections();
    }
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }

    for (const socket of activeSockets) {
      socket.destroy();
    }
    activeSockets.clear();

    /** @type {Promise<void>} */
    const closePromise = new Promise((resolve, reject) => {
      server.close((err) => {
        if (
          err &&
          /** @type {{ code?: string }} */ (err).code !==
            'ERR_SERVER_NOT_RUNNING'
        ) {
          reject(err);
          return;
        }
        isClosed = true;
        resolve();
      });
    });
    await closePromise;
  };

  /**
   * Returns current proxy metrics.
   *
   * @returns {ProxyMetrics} Transfer and chunk count metrics.
   */
  const getMetrics = () => ({
    totalBytesServed,
    totalChunksFetched,
  });

  return {
    proxyUrl,
    token,
    close,
    getMetrics,
  };
}

module.exports = {
  createBoundedRangeProxy,
};
