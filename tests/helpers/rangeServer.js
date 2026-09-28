const http = require('node:http');
const { once } = require('node:events');

/**
 * Starts a loopback HTTP server that serves `data` with Range support and
 * counts every body byte it sends.
 * @param {Buffer}                                                   data    - Object bytes.
 * @param {{etag?: string, handler?: (req, res) => boolean}}         [opts]  - Overrides; a handler returning true has responded.
 */
async function startRangeServer(data, opts = {}) {
  const stats = { requests: 0, bytesSent: 0, ranges: [] };
  const etag = opts.etag ?? '"fixture-etag"';
  const server = http.createServer((req, res) => {
    stats.requests++;
    stats.ranges.push(req.headers.range);
    if (opts.handler?.(req, res)) return;
    if (req.headers['if-match'] && req.headers['if-match'] !== etag) {
      res.writeHead(412).end();
      return;
    }
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (!match) {
      stats.bytesSent += data.length;
      res.writeHead(200, { 'content-length': data.length, etag }).end(data);
      return;
    }
    const start = Number(match[1]);
    const end = match[2]
      ? Math.min(Number(match[2]), data.length - 1)
      : data.length - 1;
    if (start >= data.length) {
      res.writeHead(416, { 'content-range': `bytes */${data.length}` }).end();
      return;
    }
    const body = data.subarray(start, end + 1);
    stats.bytesSent += body.length;
    res
      .writeHead(206, {
        'content-length': body.length,
        'content-range': `bytes ${start}-${end}/${data.length}`,
        etag,
      })
      .end(body);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = /** @type {import('node:net').AddressInfo} */ (
    server.address()
  );
  return {
    url: `http://127.0.0.1:${address.port}/object?X-Amz-Signature=secret`,
    stats,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { startRangeServer };
