/* global fetch */
const http = require('node:http');
const { once } = require('node:events');
const { Agent, request } = require('undici');
const {
  createBoundedRangeProxy,
} = require('../../../js/net/boundedRangeProxy.cjs');
const { validateChunkSize } = require('../../../js/net/rangeProtocol.cjs');

let server, origin, proxy, handler;
const requests = [];
const content = Buffer.alloc(150000, 0x42);

beforeAll(async () => {
  server = http.createServer((req, res) => {
    requests.push(req.headers);
    const [, first, last] = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range);
    const start = Number(first);
    const end = Math.min(Number(last), content.length - 1);
    const headers = {
      'content-range': `bytes ${start}-${end}/${content.length}`,
      'content-length': String(end - start + 1),
      etag: '"stable"',
    };
    handler(req, res, headers, start, end);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}/sample.bam`;
});

beforeEach(() => {
  requests.length = 0;
  handler = (_req, res, headers, start, end) => {
    res.writeHead(206, headers);
    res.end(content.subarray(start, end + 1));
  };
});

afterEach(async () => {
  await proxy?.close();
  proxy = undefined;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

async function create(options = {}) {
  proxy = await createBoundedRangeProxy(origin, {
    chunkSize: 65536,
    ...options,
  });
  return proxy;
}

const malformedHeaders = [
  ['wrong start', { 'content-range': 'bytes 1-65535/150000' }],
  ['wrong end', { 'content-range': 'bytes 0-100/150000' }],
  ['unsafe total', { 'content-range': 'bytes 0-65535/9007199254740992' }],
  ['missing total', { 'content-range': 'bytes 0-65535/*' }],
  ['wrong length', { 'content-length': '50' }],
  ['encoded body', { 'content-encoding': 'gzip' }],
];
test.each(malformedHeaders)(
  'rejects %s upstream metadata',
  async (_name, changes) => {
    handler = (_req, res, headers) => {
      res.writeHead(206, { ...headers, ...changes });
      res.end(Buffer.alloc(50));
    };
    await create();
    const response = await fetch(proxy.proxyUrl);
    expect(response.status).toBe(502);
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  },
);

test('rejects upstream responses without Content-Length', async () => {
  handler = (_req, res, headers) => {
    delete headers['content-length'];
    res.writeHead(206, headers);
    res.write(Buffer.alloc(5));
    res.end();
  };
  await create();
  const response = await fetch(proxy.proxyUrl);
  expect(response.status).toBe(502);
  await response.arrayBuffer();
});

test.each(['HEAD', 'GET'])(
  'rejects a truncated metadata/body response for %s',
  async (method) => {
    handler = (_req, res, headers) => {
      res.writeHead(206, headers);
      res.flushHeaders();
      if (method === 'GET') res.write(Buffer.alloc(10));
      const timer = setTimeout(() => res.destroy(), 30);
      res.on('close', () => clearTimeout(timer));
    };
    await create();
    if (method === 'HEAD') {
      const response = await fetch(proxy.proxyUrl, { method });
      expect(response.status).toBe(502);
    } else {
      await expect(
        fetch(proxy.proxyUrl).then((r) => r.arrayBuffer()),
      ).rejects.toThrow();
    }
  },
);

test.each(['size', 'missing etag', 'changed etag'])(
  'rejects changed %s across chunks',
  async (change) => {
    handler = (_req, res, headers, start, end) => {
      if (start > 0) {
        if (change === 'size')
          headers['content-range'] = `bytes ${start}-${end}/150001`;
        if (change === 'missing etag') delete headers.etag;
        if (change === 'changed etag') headers.etag = '"other"';
      }
      res.writeHead(206, headers);
      res.end(content.subarray(start, end + 1));
    };
    await create();
    await expect(
      fetch(proxy.proxyUrl).then((r) => r.arrayBuffer()),
    ).rejects.toThrow();
  },
);

test.each(['GET', 'HEAD'])(
  'represents an empty object as a complete empty %s',
  async (method) => {
    handler = (_req, res) => {
      res.writeHead(416, { 'content-range': 'bytes */0' });
      res.end();
    };
    await create();
    const response = await fetch(proxy.proxyUrl, { method });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('0');
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  },
);

test('empty object ranges remain unsatisfiable with the object size', async () => {
  handler = (_req, res) => {
    res.writeHead(416, { 'content-range': 'bytes */0' });
    res.end();
  };
  await create();
  const response = await fetch(proxy.proxyUrl, {
    headers: { range: 'bytes=-10' },
  });
  expect(response.status).toBe(416);
  expect(response.headers.get('content-range')).toBe('bytes */0');
  await response.arrayBuffer();
});

test.each(['bytes */9007199254740992', 'bytes */10', 'nonsense'])(
  'rejects inconsistent upstream 416 metadata %s',
  async (contentRange) => {
    handler = (_req, res) => {
      res.writeHead(416, { 'content-range': contentRange });
      res.end();
    };
    await create();
    const response = await fetch(proxy.proxyUrl);
    expect(response.status).toBe(502);
    await response.arrayBuffer();
  },
);

test.each([
  ['bytes=0-1,3-4', 400],
  ['bytes=-', 400],
  ['items=0-5', 400],
  ['bytes=9007199254740992-', 400],
  ['bytes=10-0', 416],
  ['bytes=-0', 416],
])(
  'rejects unsupported downstream range %s before upstream requests',
  async (range, status) => {
    await create();
    const response = await fetch(proxy.proxyUrl, { headers: { range } });
    expect(response.status).toBe(status);
    expect(requests).toHaveLength(0);
    await response.arrayBuffer();
  },
);

test.each(['bytes=-200000', 'bytes=0-9007199254740991'])(
  'clamps %s to the complete existing object',
  async (range) => {
    await create();
    const response = await fetch(proxy.proxyUrl, { headers: { range } });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-149999/150000');
    expect(Buffer.from(await response.arrayBuffer()).equals(content)).toBe(
      true,
    );
    expect(requests.every((r) => r['accept-encoding'] === 'identity')).toBe(
      true,
    );
  },
);

test('records observed bytes independently from requested range sizes', async () => {
  await create();
  const head = await fetch(proxy.proxyUrl, { method: 'HEAD' });
  expect(head.status).toBe(200);
  expect(proxy.getMetrics()).toEqual({
    totalChunksFetched: 1,
    upstreamBytesRead: 1,
    upstreamRequestedBytes: 1,
    totalBytesServed: 0,
  });
  const response = await fetch(proxy.proxyUrl);
  expect(Buffer.from(await response.arrayBuffer()).equals(content)).toBe(true);
  expect(proxy.getMetrics()).toEqual({
    totalChunksFetched: 4,
    upstreamBytesRead: 150001,
    upstreamRequestedBytes: 150001,
    totalBytesServed: 150000,
  });
  expect(requests.slice(1).every((r) => r['if-match'] === '"stable"')).toBe(
    true,
  );
});

test('leaves a caller-owned dispatcher usable after proxy closure', async () => {
  const dispatcher = new Agent();
  try {
    await create({ dispatcher });
    const response = await fetch(proxy.proxyUrl, { method: 'HEAD' });
    expect(response.status).toBe(200);
    await proxy.close();
    const direct = await request(origin, {
      dispatcher,
      headers: { range: 'bytes=0-0' },
    });
    expect(await direct.body.text()).toBe('B');
  } finally {
    await dispatcher.close();
  }
});

test.each([
  null,
  '65536',
  NaN,
  -1,
  0,
  65535,
  67108865,
  Number.MAX_SAFE_INTEGER,
])('rejects invalid chunk size %s', async (chunkSize) => {
  expect(() => validateChunkSize(chunkSize)).toThrow(RangeError);
  await expect(createBoundedRangeProxy(origin, { chunkSize })).rejects.toThrow(
    RangeError,
  );
});
