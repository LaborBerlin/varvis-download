const { setTimeout: sleep } = require('node:timers/promises');
const { request } = require('undici');

const ATTEMPTS = 3;
const TIMEOUT_MS = 30000;

/** A range request failure; `retryable` marks transient conditions. */
class RangeFetchError extends Error {
  /**
   * Creates a range fetch error.
   * @param {string}  message   - Diagnostic without the signed URL.
   * @param {boolean} retryable - Whether another attempt may succeed.
   */
  constructor(message, retryable) {
    super(message);
    this.name = 'RangeFetchError';
    this.retryable = retryable;
  }
}

/**
 * @typedef {object} ObjectIdentity
 * @property {number} [size] - Expected total object size.
 * @property {string} [etag] - Entity tag from an earlier response.
 */

/**
 * @typedef {object} RangeRequest
 * @property {string}                               url        - Signed object URL.
 * @property {number}                               start      - First byte.
 * @property {number}                               end        - Exclusive end byte.
 * @property {import('../types').HttpDispatcher}    [dispatcher] - Configured dispatcher.
 * @property {import('node:fs/promises').FileHandle} fileHandle - Destination, written at `start`.
 * @property {ObjectIdentity}                       [expect]   - Identity every response must match.
 * @property {AbortSignal}                          [signal]   - Cancels the request.
 */

/**
 * @typedef {object} RangeResult
 * @property {number}             size  - Total object size from Content-Range.
 * @property {string | undefined} etag  - Response entity tag.
 * @property {number}             bytes - Body bytes written.
 */

/**
 * Checks for a strong entity tag, the only kind valid for If-Match byte identity.
 * @param   {unknown} etag - Header value.
 * @returns {boolean}      - Whether `etag` is a strong tag.
 */
function isStrongEtag(etag) {
  return typeof etag === 'string' && /^"[^"]*"$/.test(etag);
}

/**
 * Performs one validated range request.
 * @param   {RangeRequest}         req - Request.
 * @returns {Promise<RangeResult>}     - Result.
 */
async function fetchOnce({
  url,
  start,
  end,
  dispatcher,
  fileHandle,
  expect,
  signal,
}) {
  /** @type {Record<string, string>} */
  const headers = {
    range: `bytes=${start}-${end - 1}`,
    'accept-encoding': 'identity',
  };
  if (isStrongEtag(expect?.etag)) headers['if-match'] = String(expect?.etag);
  const response = await request(url, {
    method: 'GET',
    headers,
    dispatcher,
    signal,
    headersTimeout: TIMEOUT_MS,
    bodyTimeout: TIMEOUT_MS,
  });
  let consumed = false;
  try {
    const status = response.statusCode;
    if (status === 200) {
      throw new RangeFetchError('Server ignored the Range header', false);
    }
    if (status !== 206) {
      throw new RangeFetchError(
        `Range request failed with HTTP ${status}`,
        status >= 500 || status === 429,
      );
    }
    const contentRange = String(response.headers['content-range'] ?? '');
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
    const size = match ? Number(match[3]) : NaN;
    if (
      !match ||
      Number(match[1]) !== start ||
      Number(match[2]) !== end - 1 ||
      (expect?.size !== undefined && expect.size !== size)
    ) {
      throw new RangeFetchError(
        `Unexpected Content-Range ${JSON.stringify(contentRange)}`,
        false,
      );
    }
    const etagHeader = response.headers.etag;
    const etag = typeof etagHeader === 'string' ? etagHeader : undefined;
    if (expect?.etag !== undefined && etag !== expect.etag) {
      throw new RangeFetchError('Remote object changed during download', false);
    }
    let position = start;
    for await (const chunk of response.body) {
      if (position + chunk.length > end) {
        throw new RangeFetchError('Response exceeded requested range', false);
      }
      await fileHandle.write(chunk, 0, chunk.length, position);
      position += chunk.length;
    }
    consumed = true;
    if (position !== end) {
      throw new RangeFetchError('Truncated range response', true);
    }
    return { size, etag, bytes: end - start };
  } finally {
    if (!consumed) {
      // Destroying an unread undici body emits 'error'; it is already handled.
      response.body.on('error', () => {});
      response.body.destroy();
    }
  }
}

/**
 * Fetches one byte range into `fileHandle`, retrying transient failures.
 * @param   {RangeRequest}         req - Request.
 * @returns {Promise<RangeResult>}     - Result.
 */
async function fetchRange(req) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchOnce(req);
    } catch (error) {
      const retryable = !(error instanceof RangeFetchError) || error.retryable;
      if (!retryable || attempt >= ATTEMPTS || req.signal?.aborted) throw error;
      await sleep(250 * 2 ** (attempt - 1));
    }
  }
}

/**
 * @typedef {object} RangesRequest
 * @property {string}                                url           - Signed object URL.
 * @property {Array<[number, number]>}               ranges        - Half-open byte ranges.
 * @property {import('../types').HttpDispatcher}     [dispatcher]  - Configured dispatcher.
 * @property {import('node:fs/promises').FileHandle} fileHandle    - Destination.
 * @property {ObjectIdentity}                        expect        - Identity every response must match.
 * @property {number}                                [concurrency] - Parallel requests.
 */

/**
 * Fetches many ranges with bounded concurrency. The first failure aborts the
 * other requests, and the call rejects only after every worker has stopped, so
 * no write can land after the caller starts cleaning up.
 * @param   {RangesRequest}                              req - Request.
 * @returns {Promise<{bytes: number, requests: number}>}     - Totals.
 */
async function fetchRanges({
  url,
  ranges,
  dispatcher,
  fileHandle,
  expect,
  concurrency = 4,
}) {
  const controller = new AbortController();
  let next = 0;
  let bytes = 0;
  /** @type {unknown[]} */
  const errors = [];
  const worker = async () => {
    while (!controller.signal.aborted && next < ranges.length) {
      const [start, end] = ranges[next++];
      try {
        const result = await fetchRange({
          url,
          start,
          end,
          dispatcher,
          fileHandle,
          expect,
          signal: controller.signal,
        });
        bytes += result.bytes;
      } catch (error) {
        if (!controller.signal.aborted) {
          errors.push(error);
          controller.abort();
        }
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, ranges.length) }, worker),
  );
  if (errors.length > 0) throw errors[0];
  return { bytes, requests: ranges.length };
}

module.exports = { RangeFetchError, fetchRange, fetchRanges, isStrongEtag };
