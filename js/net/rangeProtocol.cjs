const DEFAULT_CHUNK_SIZE = 2097152;

/**
 * Recognizes a strong HTTP entity tag suitable for byte identity checks.
 * @param   {unknown} value - Upstream entity tag.
 * @returns {boolean}       - Whether this is one syntactically valid strong tag.
 */
function isStrongEtag(value) {
  return (
    typeof value === 'string' && /^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value)
  );
}

/**
 * Validates the maximum upstream request size.
 * @param   {unknown} value - Requested chunk size.
 * @returns {number}        - Validated byte count.
 */
function validateChunkSize(value) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 65536 ||
    value > 67108864
  ) {
    throw new RangeError(
      'chunkSize must be an integer between 65536 and 67108864',
    );
  }
  return value;
}

/** An HTTP error that can be returned before downstream headers are sent. */
class RangeProtocolError extends Error {
  /**
   * Constructs a range protocol error.
   * @param {string} message      - Safe diagnostic.
   * @param {number} [status=502] - Downstream status.
   * @param {number} [size]       - Known object size for a 416 response.
   */
  constructor(message, status = 502, size) {
    super(message);
    this.status = status;
    this.size = size;
  }
}

/**
 * Parses one downstream byte range without unsafe integer rounding.
 * @param   {string | undefined}                             range - Range header.
 * @returns {{start: number, end?: number, suffix?: number}}       - Requested span.
 */
function parseRange(range) {
  if (range === undefined) return { start: 0 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (
    !match ||
    (!match[1] && !match[2]) ||
    match.slice(1).some((part) => part && !Number.isSafeInteger(Number(part)))
  ) {
    throw new RangeProtocolError('Invalid byte range', 400);
  }
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (suffix === 0) throw new RangeProtocolError('Empty suffix range', 416);
    return { start: 0, suffix };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : undefined;
  if (end !== undefined && end < start)
    throw new RangeProtocolError('Reversed byte range', 416);
  return { start, end };
}

/**
 * Validates the exact upstream representation and stable object identity.
 * @param   {import('undici').Dispatcher.ResponseData}   response - Raw response.
 * @param   {number}                                     start    - Requested first byte.
 * @param   {number}                                     end      - Requested last byte.
 * @param   {{size?: number, etag?: string}}             object   - Previous object metadata.
 * @returns {{size: number, end: number, etag?: string}}          - Validated metadata.
 */
function validateResponse(response, start, end, object) {
  const range = response.headers['content-range'];
  if (response.statusCode === 416) {
    const match = typeof range === 'string' && /^bytes \*\/(\d+)$/.exec(range);
    const size = match ? Number(match[1]) : NaN;
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      start < size ||
      (object.size !== undefined && object.size !== size)
    ) {
      throw new RangeProtocolError('Invalid upstream unsatisfiable range');
    }
    throw new RangeProtocolError('Unsatisfiable range', 416, size);
  }
  const match =
    typeof range === 'string' && /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
  const size = match ? Number(match[3]) : NaN;
  const actualEnd = Math.min(end, size - 1);
  const length = response.headers['content-length'];
  const encoding = response.headers['content-encoding'];
  const etag = response.headers.etag;
  if (
    response.statusCode !== 206 ||
    !match ||
    !Number.isSafeInteger(size) ||
    size <= start ||
    Number(match[1]) !== start ||
    Number(match[2]) !== actualEnd ||
    typeof length !== 'string' ||
    !/^\d+$/.test(length) ||
    Number(length) !== actualEnd - start + 1 ||
    (encoding !== undefined && encoding !== 'identity') ||
    (etag !== undefined && typeof etag !== 'string') ||
    (object.size !== undefined &&
      (!isStrongEtag(object.etag) ||
        object.size !== size ||
        object.etag !== etag))
  ) {
    throw new RangeProtocolError('Upstream range or object identity mismatch');
  }
  return { size, end: actualEnd, etag };
}

module.exports = {
  DEFAULT_CHUNK_SIZE,
  validateChunkSize,
  isStrongEtag,
  RangeProtocolError,
  parseRange,
  validateResponse,
};
