const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  fetchRange,
  fetchRanges,
  isStrongEtag,
} = require('../../../js/range/rangeFetcher.cjs');
const { startRangeServer } = require('../../helpers/rangeServer');

describe('range/rangeFetcher', () => {
  const data = crypto.randomBytes(300_000);
  let dir;
  let file;
  let handle;
  let server;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'varvis-fetch-'));
    file = path.join(dir, 'mirror');
    handle = await fsp.open(file, 'w+');
  });

  afterEach(async () => {
    await handle.close();
    await server?.close();
    server = undefined;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('writes exactly the requested range at its offset', async () => {
    server = await startRangeServer(data);
    const result = await fetchRange({
      url: server.url,
      start: 1000,
      end: 5000,
      fileHandle: handle,
    });
    expect(result).toEqual({
      size: data.length,
      etag: '"fixture-etag"',
      bytes: 4000,
    });
    const written = fs.readFileSync(file);
    expect(written.subarray(1000, 5000)).toEqual(data.subarray(1000, 5000));
    expect(server.stats.ranges).toEqual(['bytes=1000-4999']);
  });

  test('rejects a server that ignores Range without retrying', async () => {
    server = await startRangeServer(data, {
      handler: (_req, res) => {
        res.writeHead(200, { 'content-length': data.length }).end(data);
        return true;
      },
    });
    await expect(
      fetchRange({ url: server.url, start: 0, end: 10, fileHandle: handle }),
    ).rejects.toThrow(/ignored the Range/);
    expect(server.stats.requests).toBe(1);
  });

  test('rejects a mismatched Content-Range or object size', async () => {
    server = await startRangeServer(data);
    await expect(
      fetchRange({
        url: server.url,
        start: 0,
        end: 10,
        fileHandle: handle,
        expect: { size: data.length + 1 },
      }),
    ).rejects.toThrow(/Content-Range/);
  });

  test('rejects an object that changed (If-Match failure)', async () => {
    server = await startRangeServer(data, { etag: '"new"' });
    await expect(
      fetchRange({
        url: server.url,
        start: 0,
        end: 10,
        fileHandle: handle,
        expect: { etag: '"old"' },
      }),
    ).rejects.toThrow(/HTTP 412/);
  });

  test('retries transient 5xx responses', async () => {
    let failures = 1;
    server = await startRangeServer(data, {
      handler: (_req, res) => {
        if (failures-- > 0) {
          res.writeHead(503).end();
          return true;
        }
        return false;
      },
    });
    const result = await fetchRange({
      url: server.url,
      start: 0,
      end: 10,
      fileHandle: handle,
    });
    expect(result.bytes).toBe(10);
    expect(server.stats.requests).toBe(2);
  });

  test('error messages never include the signed URL', async () => {
    server = await startRangeServer(data, {
      handler: (_req, res) => {
        res.writeHead(403).end();
        return true;
      },
    });
    const error = await fetchRange({
      url: server.url,
      start: 0,
      end: 10,
      fileHandle: handle,
    }).catch((e) => e);
    expect(String(error.message)).not.toMatch(/Signature|127\.0\.0\.1/);
  });

  test('fetchRanges writes every range with bounded concurrency', async () => {
    server = await startRangeServer(data);
    const ranges = [
      [0, 100],
      [50_000, 120_000],
      [200_000, 200_001],
      [299_000, 300_000],
    ];
    const totals = await fetchRanges({
      url: server.url,
      ranges,
      fileHandle: handle,
      expect: { size: data.length, etag: '"fixture-etag"' },
      concurrency: 2,
    });
    expect(totals).toEqual({ bytes: 71_101, requests: 4 });
    const written = fs.readFileSync(file);
    for (const [s, e] of ranges) {
      expect(written.subarray(s, e)).toEqual(data.subarray(s, e));
    }
  });

  test('isStrongEtag distinguishes weak tags', () => {
    expect(isStrongEtag('"abc"')).toBe(true);
    expect(isStrongEtag('W/"abc"')).toBe(false);
    expect(isStrongEtag()).toBe(false);
  });
});
