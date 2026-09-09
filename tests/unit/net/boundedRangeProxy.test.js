/* global fetch */

const http = require('node:http');
const { URL } = require('node:url');
const {
  createBoundedRangeProxy,
} = require('../../../js/net/boundedRangeProxy.cjs');

describe('net/boundedRangeProxy.createBoundedRangeProxy', () => {
  /** @type {http.Server} */
  let upstreamServer;
  let upstreamPort;
  let upstreamBaseUrl;

  /** @type {Array<string>} */
  let upstreamReceivedRanges = [];
  /** @type {Array<{ method: string, url: string, headers: http.IncomingHttpHeaders }>} */
  let upstreamReceivedRequests = [];
  /** @type {(() => void) | null} */
  let upstreamAbortListener = null;

  /** @type {Array<{ close: () => Promise<void> }>} */
  const activeProxies = [];

  beforeAll(async () => {
    upstreamServer = http.createServer((req, res) => {
      upstreamReceivedRequests.push({
        method: req.method || 'GET',
        url: req.url || '/',
        headers: req.headers,
      });

      if (req.headers.range) {
        upstreamReceivedRanges.push(req.headers.range);
      }

      if (req.url === '/slow-stream') {
        req.on('close', () => {
          if (upstreamAbortListener) {
            upstreamAbortListener();
          }
        });
        res.writeHead(206, {
          'content-type': 'application/octet-stream',
          'content-range': 'bytes 0-10485759/10485760',
          'content-length': '10485760',
          'accept-ranges': 'bytes',
        });
        // Write a small chunk then do not finish to test abort
        res.write(Buffer.alloc(1024, 0x41));
        return;
      }

      if (req.url === '/upstream-500') {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('Upstream Internal Error');
        return;
      }

      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'content-length': '10485760',
          'accept-ranges': 'bytes',
          'content-type': 'application/octet-stream',
        });
        res.end();
        return;
      }

      if (req.method === 'GET') {
        const range = req.headers.range;
        if (range) {
          const match = /^bytes=(\d+)-(\d+)$/.exec(range);
          if (match) {
            const start = Number.parseInt(match[1], 10);
            const end = Number.parseInt(match[2], 10);
            const chunkLen = end - start + 1;
            res.writeHead(206, {
              'content-range': `bytes ${start}-${end}/10485760`,
              'content-length': String(chunkLen),
              'content-type': 'application/octet-stream',
              'accept-ranges': 'bytes',
            });
            res.end(Buffer.alloc(chunkLen, 0x42));
            return;
          }
        }
        // Fallback GET
        res.writeHead(200, {
          'content-length': '10485760',
          'content-type': 'application/octet-stream',
          'accept-ranges': 'bytes',
        });
        res.end(Buffer.alloc(10485760, 0x42));
        return;
      }

      res.writeHead(405, { 'content-type': 'text/plain' });
      res.end('Method Not Allowed');
    });

    await new Promise((resolve) => {
      upstreamServer.listen(0, '127.0.0.1', () => {
        const addr = upstreamServer.address();
        if (addr && typeof addr !== 'string') {
          upstreamPort = addr.port;
          upstreamBaseUrl = `http://127.0.0.1:${upstreamPort}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (typeof upstreamServer.closeAllConnections === 'function') {
      upstreamServer.closeAllConnections();
    }
    await new Promise((resolve) => {
      upstreamServer.close(() => resolve());
    });
    try {
      const { getGlobalDispatcher } = require('undici');
      await getGlobalDispatcher().close();
    } catch {
      // ignore if undici not loaded or closed
    }
  });

  beforeEach(() => {
    upstreamReceivedRanges = [];
    upstreamReceivedRequests = [];
    upstreamAbortListener = null;
  });

  afterEach(async () => {
    while (activeProxies.length > 0) {
      const proxy = activeProxies.pop();
      if (proxy) {
        await proxy.close();
      }
    }
  });

  test('creates proxy on 127.0.0.1 with random UUID token in path', async () => {
    const proxy = await createBoundedRangeProxy(`${upstreamBaseUrl}/file.bam`);
    activeProxies.push(proxy);

    expect(proxy.proxyUrl).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/stream\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(proxy.token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(typeof proxy.close).toBe('function');
    expect(typeof proxy.getMetrics).toBe('function');
    expect(proxy.getMetrics()).toEqual({
      totalBytesServed: 0,
      totalChunksFetched: 0,
    });
  });

  test('forwards HEAD requests to upstream with content-length, accept-ranges, and content-type', async () => {
    const proxy = await createBoundedRangeProxy(`${upstreamBaseUrl}/file.bam`);
    activeProxies.push(proxy);

    const res = await fetch(proxy.proxyUrl, { method: 'HEAD' });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('10485760');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-type')).toBe('application/octet-stream');

    const lastReq =
      upstreamReceivedRequests[upstreamReceivedRequests.length - 1];
    expect(lastReq.method).toBe('HEAD');
  });

  test('rewrites unbounded Range bytes=0- to bounded Range with default 2MB chunkSize', async () => {
    const proxy = await createBoundedRangeProxy(`${upstreamBaseUrl}/file.bam`);
    activeProxies.push(proxy);

    const res = await fetch(proxy.proxyUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-' },
    });

    expect(res.status).toBe(206);
    expect(upstreamReceivedRanges).toHaveLength(1);
    expect(upstreamReceivedRanges[0]).toBe('bytes=0-2097151');
  });

  test('rewrites unbounded Range bytes=1000- using custom chunkSize', async () => {
    const proxy = await createBoundedRangeProxy(`${upstreamBaseUrl}/file.bam`, {
      chunkSize: 100,
    });
    activeProxies.push(proxy);

    const res = await fetch(proxy.proxyUrl, {
      method: 'GET',
      headers: { Range: 'bytes=1000-' },
    });

    expect(res.status).toBe(206);
    expect(upstreamReceivedRanges).toHaveLength(1);
    expect(upstreamReceivedRanges[0]).toBe('bytes=1000-1099');
  });

  test('passes through already-bounded Range when smaller than chunkSize', async () => {
    const proxy = await createBoundedRangeProxy(`${upstreamBaseUrl}/file.bam`, {
      chunkSize: 1000,
    });
    activeProxies.push(proxy);

    const res = await fetch(proxy.proxyUrl, {
      method: 'GET',
      headers: { Range: 'bytes=10-50' },
    });

    expect(res.status).toBe(206);
    expect(upstreamReceivedRanges).toHaveLength(1);
    expect(upstreamReceivedRanges[0]).toBe('bytes=10-50');
  });

  test('clamps already-bounded Range when larger than chunkSize', async () => {
    const proxy = await createBoundedRangeProxy(`${upstreamBaseUrl}/file.bam`, {
      chunkSize: 100,
    });
    activeProxies.push(proxy);

    const res = await fetch(proxy.proxyUrl, {
      method: 'GET',
      headers: { Range: 'bytes=10-500' },
    });

    expect(res.status).toBe(206);
    expect(upstreamReceivedRanges).toHaveLength(1);
    expect(upstreamReceivedRanges[0]).toBe('bytes=10-109');
  });

  test('enforces token authorization: accepts valid token path and rejects unauthorized paths with 403', async () => {
    const proxy = await createBoundedRangeProxy(`${upstreamBaseUrl}/file.bam`);
    activeProxies.push(proxy);

    const parsedUrl = new URL(proxy.proxyUrl);

    // Valid path with query parameter allowed
    const validWithQuery = await fetch(`${proxy.proxyUrl}?test=1`, {
      method: 'HEAD',
    });
    expect(validWithQuery.status).toBe(200);

    // Invalid token in path
    const invalidTokenUrl = `http://127.0.0.1:${parsedUrl.port}/stream/00000000-0000-0000-0000-000000000000`;
    const invalidRes = await fetch(invalidTokenUrl, { method: 'HEAD' });
    expect(invalidRes.status).toBe(403);

    // Root path
    const rootRes = await fetch(`http://127.0.0.1:${parsedUrl.port}/`, {
      method: 'HEAD',
    });
    expect(rootRes.status).toBe(403);

    // Different subpath
    const subpathRes = await fetch(
      `http://127.0.0.1:${parsedUrl.port}/stream`,
      {
        method: 'HEAD',
      },
    );
    expect(subpathRes.status).toBe(403);
  });

  test('aborts upstream request when client socket disconnects early', async () => {
    const proxy = await createBoundedRangeProxy(
      `${upstreamBaseUrl}/slow-stream`,
    );
    activeProxies.push(proxy);

    const upstreamAbortedPromise = new Promise((resolve) => {
      upstreamAbortListener = () => resolve(true);
    });

    const parsed = new URL(proxy.proxyUrl);
    const clientReq = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'GET',
        headers: { Range: 'bytes=0-' },
      },
      (res) => {
        res.on('data', () => {
          // Destroy client socket immediately upon receiving first chunk
          clientReq.destroy();
        });
      },
    );

    clientReq.end();

    let timerId;
    const wasAborted = await Promise.race([
      upstreamAbortedPromise,
      new Promise((resolve) => {
        timerId = setTimeout(() => resolve(false), 2000);
      }),
    ]);
    clearTimeout(timerId);

    expect(wasAborted).toBe(true);
  });

  test('tracks metrics for totalChunksFetched and totalBytesServed', async () => {
    const proxy = await createBoundedRangeProxy(`${upstreamBaseUrl}/file.bam`, {
      chunkSize: 50,
    });
    activeProxies.push(proxy);

    const res1 = await fetch(proxy.proxyUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-' },
    });
    const body1 = await res1.arrayBuffer();
    expect(body1.byteLength).toBe(50);

    expect(proxy.getMetrics()).toEqual({
      totalBytesServed: 50,
      totalChunksFetched: 1,
    });

    const res2 = await fetch(proxy.proxyUrl, {
      method: 'GET',
      headers: { Range: 'bytes=100-119' },
    });
    const body2 = await res2.arrayBuffer();
    expect(body2.byteLength).toBe(20);

    expect(proxy.getMetrics()).toEqual({
      totalBytesServed: 70,
      totalChunksFetched: 2,
    });
  });

  test('close() tears down server cleanly and can be called multiple times', async () => {
    const proxy = await createBoundedRangeProxy(`${upstreamBaseUrl}/file.bam`);

    const resBefore = await fetch(proxy.proxyUrl, { method: 'HEAD' });
    expect(resBefore.status).toBe(200);

    await proxy.close();

    // Subsequent requests must fail connection
    await expect(fetch(proxy.proxyUrl, { method: 'HEAD' })).rejects.toThrow();

    // Calling close again should safely resolve
    await expect(proxy.close()).resolves.toBeUndefined();
  });

  test('returns 502 Bad Gateway when upstream server fails or is unreachable', async () => {
    // Unreachable upstream port
    const badProxy = await createBoundedRangeProxy('http://127.0.0.1:1');
    activeProxies.push(badProxy);

    const res = await fetch(badProxy.proxyUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-' },
    });
    expect(res.status).toBe(502);
  });

  test('returns 405 Method Not Allowed for non-GET/HEAD methods', async () => {
    const proxy = await createBoundedRangeProxy(`${upstreamBaseUrl}/file.bam`);
    activeProxies.push(proxy);

    const res = await fetch(proxy.proxyUrl, { method: 'POST' });
    expect(res.status).toBe(405);
  });
});
