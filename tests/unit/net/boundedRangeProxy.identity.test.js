/* global fetch */
const http = require('node:http');
const { once } = require('node:events');
const {
  createBoundedRangeProxy,
} = require('../../../js/net/boundedRangeProxy.cjs');

let server, url, proxy, etag, pending;
let count = 0;
const length = 131072;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    count++;
    const [, first, last] = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range);
    const start = Number(first),
      end = Math.min(Number(last), length - 1);
    const send = () => {
      res.writeHead(206, {
        'content-length': end - start + 1,
        'content-range': `bytes ${start}-${end}/${length}`,
        ...(etag === undefined ? {} : { etag }),
      });
      res.end(Buffer.alloc(end - start + 1, start === 0 ? 65 : 66));
    };
    if (pending) {
      pending.push(send);
      if (pending.length === 2) for (const respond of pending) respond();
    } else send();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}/source.bam`;
});
beforeEach(() => {
  count = 0;
  pending = undefined;
});
afterEach(async () => {
  await proxy?.close();
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const invalidValidators = [
  undefined,
  'W/"same"',
  'unquoted',
  '"contains space"',
  '"two", "tags"',
];
test.each(invalidValidators)(
  'does not assemble multiple chunks under validator %s',
  async (value) => {
    etag = value;
    proxy = await createBoundedRangeProxy(url, { chunkSize: 65536 });
    const outcome = await fetch(proxy.proxyUrl).then(async (response) => {
      try {
        await response.arrayBuffer();
        return response.status;
      } catch {
        return 'aborted';
      }
    });
    expect([502, 'aborted']).toContain(outcome);
    expect(count).toBe(1);
  },
);

test.each(invalidValidators)(
  'allows one bounded response but rejects a later seek under validator %s',
  async (value) => {
    etag = value;
    proxy = await createBoundedRangeProxy(url, { chunkSize: 65536 });
    const first = await fetch(proxy.proxyUrl, {
      headers: { range: 'bytes=0-9' },
    });
    expect(first.status).toBe(206);
    expect(await first.text()).toBe('AAAAAAAAAA');
    const second = await fetch(proxy.proxyUrl, {
      headers: { range: 'bytes=10-19' },
    });
    expect(second.status).toBe(502);
    await second.arrayBuffer();
    expect(count).toBe(1);
  },
);

test.each([undefined, 'W/"same"', 'unquoted'])(
  'concurrent initial reads cannot bypass validator requirement %s',
  async (value) => {
    etag = value;
    pending = [];
    proxy = await createBoundedRangeProxy(url, { chunkSize: 65536 });
    const outcomes = await Promise.all(
      ['bytes=0-9', 'bytes=10-19'].map(async (range) => {
        const response = await fetch(proxy.proxyUrl, { headers: { range } });
        await response.arrayBuffer();
        return response.status;
      }),
    );
    expect(outcomes.sort()).toEqual([206, 502]);
  },
);

test('concurrent initial reads with a strong validator remain supported', async () => {
  etag = '"same"';
  pending = [];
  proxy = await createBoundedRangeProxy(url, { chunkSize: 65536 });
  const outcomes = await Promise.all(
    ['bytes=0-9', 'bytes=10-19'].map(async (range) => {
      const response = await fetch(proxy.proxyUrl, { headers: { range } });
      return { status: response.status, text: await response.text() };
    }),
  );
  expect(outcomes).toEqual([
    { status: 206, text: 'AAAAAAAAAA' },
    { status: 206, text: 'BBBBBBBBBB' },
  ]);
});
