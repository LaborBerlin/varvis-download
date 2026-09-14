const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { rangedDownloadVCF } = require('../../../js/rangedUtils.cjs');

describe('real tabix reads a VCF across upstream chunks', () => {
  let directory;
  let server;
  let source;
  let index;
  let data;
  let expected;
  let requests;
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const logger = Object.fromEntries(
    ['info', 'warn', 'error', 'debug'].map((key) => [key, () => {}]),
  );

  beforeAll(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'varvis-local-vcf-'));
    const file = path.join(directory, 'fixture.vcf.gz');
    let text =
      '##fileformat=VCFv4.2\n##contig=<ID=1,length=200000>\n##INFO=<ID=X,Number=1,Type=String,Description="Synthetic value">\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n';
    for (let pos = 1; pos <= 120000; pos++) {
      text += `1\t${pos}\t.\tA\tG\t50\tPASS\tX=${hash(String(pos))}\n`;
    }
    expected = hash(text);
    const compressed = spawnSync('bgzip', ['-c'], {
      input: text,
      maxBuffer: 20 * 1024 * 1024,
    });
    expect(compressed.status).toBe(0);
    data = compressed.stdout;
    expect(data.length).toBeGreaterThan(2 * 1024 * 1024);
    fs.writeFileSync(file, data);
    expect(spawnSync('tabix', ['-p', 'vcf', file]).status).toBe(0);
    index = path.join(directory, 'independent-index.tbi');
    fs.renameSync(file + '.tbi', index);
    const etag = `"${hash(data)}"`;
    server = http.createServer((req, res) => {
      requests.push(req.headers.range);
      if (req.url !== '/opaque-download') {
        res.writeHead(404).end();
        return;
      }
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2]
        ? Math.min(Number(range[2]), data.length - 1)
        : data.length - 1;
      if (start >= data.length) {
        res.writeHead(416, { 'content-range': `bytes */${data.length}` }).end();
        return;
      }
      res.writeHead(range ? 206 : 200, {
        'content-length': end - start + 1,
        etag,
        ...(range
          ? { 'content-range': `bytes ${start}-${end}/${data.length}` }
          : {}),
      });
      res.end(
        req.method === 'HEAD' ? undefined : data.subarray(start, end + 1),
      );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    source = `http://127.0.0.1:${server.address().port}/opaque-download`;
  });

  afterAll(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  });

  test.each([null, 65536, 2097152])(
    'preserves all records with chunk size %s and an explicit local index',
    async (chunkSize) => {
      requests = [];
      const output = path.join(directory, `output-${chunkSize}.vcf.gz`);
      const metrics = {
        totalFilesDownloaded: 0,
        totalFilesSkipped: 0,
        totalBytesDownloaded: 0,
        downloadSpeeds: [],
      };
      await rangedDownloadVCF(
        source,
        '1:1-120000',
        output,
        index,
        logger,
        metrics,
        true,
        {
          enabled: chunkSize !== null,
          chunkSize: chunkSize ?? undefined,
        },
      );
      expect(hash(gunzipSync(fs.readFileSync(output)))).toBe(expected);
      if (chunkSize !== null) {
        expect(requests.length).toBeGreaterThan(1);
        for (const range of requests) {
          expect(range).toMatch(/^bytes=\d+-\d+$/);
          const [start, end] = range.slice(6).split('-').map(Number);
          expect(end - start + 1).toBeLessThanOrEqual(chunkSize);
        }
      }
    },
  );
});
