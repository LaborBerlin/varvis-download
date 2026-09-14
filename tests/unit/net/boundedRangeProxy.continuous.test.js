const http = require('node:http');
const { once } = require('node:events');
const net = require('node:net');
/* global fetch, URL */
const reqModule = require;
const {
  createBoundedRangeProxy,
} = require('../../../js/net/boundedRangeProxy.cjs');
const content = Buffer.from(Array.from({ length: 310000 }, (_, i) => i % 251));
let server,
  origin,
  requests = [],
  proxies = [],
  slowClosed;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    requests.push({
      url: req.url,
      range: req.headers.range,
      method: req.method,
    });
    if (req.url === '/ignore') {
      res.writeHead(200, { 'content-length': content.length });
      res.end(content);
      return;
    }
    if (req.url === '/stall') return;
    const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
    if (!m) {
      res.writeHead(400);
      res.end();
      return;
    }
    const start = +m[1],
      end = Math.min(+m[2], content.length - 1);
    if (start >= content.length) {
      res.writeHead(416, { 'content-range': `bytes */${content.length}` });
      res.end();
      return;
    }
    const headers = {
      'content-length': end - start + 1,
      'content-range': `bytes ${start}-${end}/${content.length}`,
      etag: req.url === '/mutate' && start > 0 ? '"changed"' : '"stable"',
      'accept-ranges': 'bytes',
    };
    res.writeHead(206, headers);
    if (req.url === '/slow') {
      slowClosed = once(res, 'close');
      res.write(content.subarray(start, start + 1024));
      const timer = setTimeout(
        () => res.end(content.subarray(start + 1024, end + 1)),
        10000,
      );
      res.on('close', () => clearTimeout(timer));
      return;
    }
    res.end(content.subarray(start, end + 1));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => {
  await Promise.all(proxies.map((p) => p.close()));
  proxies = [];
  requests = [];
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});
async function proxy(suffix = '/sample.vcf.gz', opts = {}) {
  const p = await createBoundedRangeProxy(origin + suffix, {
    chunkSize: 65536,
    ...opts,
  });
  proxies.push(p);
  return p;
}
test('range-free GET presents the real file size and byte-exact complete stream', async () => {
  const p = await proxy();
  const r = await fetch(p.proxyUrl);
  expect(r.status).toBe(200);
  expect(r.headers.get('content-length')).toBe(String(content.length));
  expect(Buffer.from(await r.arrayBuffer())).toEqual(content);
  expect(requests.length).toBeGreaterThan(1);
  for (const q of requests) {
    const [a, b] = q.range.slice(6).split('-').map(Number);
    expect(b - a + 1).toBeLessThanOrEqual(65536);
  }
});
test('open-ended ranges continue across chunk boundaries without corrupting bytes', async () => {
  const p = await proxy();
  const r = await fetch(p.proxyUrl, { headers: { range: 'bytes=70000-' } });
  expect(r.status).toBe(206);
  expect(r.headers.get('content-range')).toBe(
    `bytes 70000-${content.length - 1}/${content.length}`,
  );
  expect(Buffer.from(await r.arrayBuffer())).toEqual(content.subarray(70000));
});
test('finite and suffix ranges return precisely the requested bytes', async () => {
  const p = await proxy();
  for (const [range, start, end] of [
    ['bytes=100-200000', 100, 200000],
    ['bytes=-50', content.length - 50, content.length - 1],
  ]) {
    const r = await fetch(p.proxyUrl, { headers: { range } });
    expect(r.status).toBe(206);
    expect(Buffer.from(await r.arrayBuffer())).toEqual(
      content.subarray(start, end + 1),
    );
  }
});
test('HEAD works with GET-only signed upstreams and reports complete length', async () => {
  const p = await proxy();
  const r = await fetch(p.proxyUrl, { method: 'HEAD' });
  expect(r.status).toBe(200);
  expect(r.headers.get('content-length')).toBe(String(content.length));
  expect(requests[0].method).toBe('GET');
});
test('a source that ignores Range fails closed instead of streaming a full object', async () => {
  const p = await proxy('/ignore');
  const r = await fetch(p.proxyUrl);
  expect(r.status).toBe(502);
  await r.arrayBuffer();
});
test('changing objects abort the stream rather than splice different versions', async () => {
  const p = await proxy('/mutate');
  const r = await fetch(p.proxyUrl);
  await expect(r.arrayBuffer()).rejects.toThrow();
});
test('the proxy preserves the filename needed for local tabix index discovery', async () => {
  const p = await proxy();
  expect(new URL(p.proxyUrl).pathname.endsWith('/sample.vcf.gz')).toBe(true);
});
test.each([1, 65536.5, Infinity, 67108865])(
  'rejects invalid chunk size %s',
  async (chunkSize) => {
    await expect(proxy('/sample.bam', { chunkSize })).rejects.toThrow();
  },
);
test('unsatisfiable requests preserve the full size in a 416 response', async () => {
  const p = await proxy();
  const r = await fetch(p.proxyUrl, { headers: { range: 'bytes=999999-' } });
  expect(r.status).toBe(416);
  expect(r.headers.get('content-range')).toBe(`bytes */${content.length}`);
  await r.arrayBuffer();
});
test('client cancellation stops a slow upstream and proxy closure is repeatable', async () => {
  const p = await proxy('/slow');
  const r = await fetch(p.proxyUrl);
  const reader = r.body.getReader();
  await reader.read();
  await reader.cancel();
  let timer;
  try {
    await Promise.race([
      slowClosed,
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error('Upstream remained open after client cancellation'),
            ),
          1000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  await p.close();
  await p.close();
  await expect(fetch(p.proxyUrl)).rejects.toThrow();
});
test('closing during an upstream header wait cancels the pending downstream request', async () => {
  const p = await proxy('/stall');
  const response = fetch(p.proxyUrl).catch((e) => e);
  await new Promise((r) => setTimeout(r, 100));
  await p.close();
  expect(await response).toMatchObject({ name: 'TypeError' });
});
test('uses the provided dispatcher for upstream connections', async () => {
  const { ProxyAgent } = reqModule('undici');
  let tunnels = 0;
  const sockets = [];
  const tunnel = http.createServer();
  tunnel.on('connect', (request, socket, head) => {
    tunnels++;
    sockets.push(socket);
    const [host, port] = request.url.split(':');
    const peer = net.connect(Number(port), host, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) peer.write(head);
      socket.pipe(peer);
      peer.pipe(socket);
    });
    sockets.push(peer);
    peer.on('error', () => socket.destroy());
    socket.on('error', () => peer.destroy());
  });
  tunnel.listen(0, '127.0.0.1');
  await once(tunnel, 'listening');
  const agent = new ProxyAgent({
    uri: `http://127.0.0.1:${tunnel.address().port}`,
    proxyTunnel: true,
  });
  try {
    const p = await proxy('/sample.bam', { dispatcher: agent });
    const r = await fetch(p.proxyUrl, { headers: { range: 'bytes=123-456' } });
    expect(Buffer.from(await r.arrayBuffer())).toEqual(
      content.subarray(123, 457),
    );
    expect(tunnels).toBeGreaterThan(0);
  } finally {
    for (const socket of sockets) socket.destroy();
    await agent.destroy();
    await new Promise((r) => tunnel.close(r));
  }
});
