const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

let directory, preload, server, url;
let requests = 0;
const script = path.resolve(
  __dirname,
  '../../../scripts/benchmark-bounded-proxy.mjs',
);

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'varvis-benchmark-test-'));
  preload = path.join(directory, 'tools.cjs');
  fs.writeFileSync(
    preload,
    `
const cp = require('node:child_process');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const http = require('node:http');
cp.spawn = (_tool, args) => {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
  const finish = code => { child.stdout.end(); child.stderr.end(); child.emit('close', code); };
  setImmediate(() => {
    if (process.env.TEST_TOOL_MODE === 'diagnostic') {
      child.stderr.write('tool failed Ht');
      setImmediate(() => { child.stderr.write('Tp://example.invalid/source?signature=REDACTION_PROBE\\n'); finish(1); });
      return;
    }
    if (process.env.TEST_TOOL_MODE === 'no-read') { child.stdout.write('help text\\n'); finish(0); return; }
    const delimiter = args.indexOf('--');
    if (delimiter < 0) { child.stderr.write('positional arguments lack option terminator'); finish(2); return; }
    http.get(args[delimiter + 1], response => {
      response.resume();
      response.on('end', () => { child.stdout.write('decoded record\\n'); finish(0); });
    }).on('error', error => { child.stderr.write(error.message); finish(1); });
  });
  return child;
};
require('node:module').syncBuiltinESMExports();
`,
  );
  server = http.createServer((req, res) => {
    requests++;
    const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
    if (range) {
      res.writeHead(206, {
        'content-range': 'bytes 0-0/1',
        'content-length': '1',
        etag: '"stable"',
      });
    } else res.writeHead(200, { 'content-length': '1' });
    res.end('A');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
  requests = 0;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(directory, { recursive: true, force: true });
});

async function run(region, mode = 'no-read', type = 'bam') {
  const child = spawn(process.execPath, ['--require', preload, script], {
    env: {
      ...process.env,
      BENCHMARK_URL: url + '/source.bam',
      BENCHMARK_INDEX_URL: url + '/index',
      BENCHMARK_REGION: region,
      BENCHMARK_TYPE: type,
      TEST_TOOL_MODE: mode,
    },
  });
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (bytes) => {
    stdout += bytes;
  });
  child.stderr.on('data', (bytes) => {
    stderr += bytes;
  });
  const [code] = await once(child, 'close');
  return { code, stdout, stderr };
}

test.each(['--help', '--version', ' --help'])(
  'rejects option-like region %s before any network activity',
  async (region) => {
    const result = await run(region);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/region/i);
    expect(result.stdout).not.toContain('"matchesControl": true');
    expect(requests).toBe(0);
  },
);

test('does not report equal help output as a successful data comparison', async () => {
  const result = await run('1:1-10');
  expect(result.code).toBe(1);
  expect(result.stderr).toMatch(/proxy.*(read|bytes|data)/i);
  expect(result.stdout).not.toContain('"matchesControl": true');
});

test('redacts mixed-case URL diagnostics after joining split tool output', async () => {
  const result = await run('1:1-10', 'diagnostic');
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('[redacted URL]');
  expect(result.stderr).not.toContain('REDACTION_PROBE');
  expect(result.stderr).not.toContain('example.invalid');
});

test.each(['bam', 'vcf'])(
  'terminates positional options and permits populated unmapped/control reads for %s',
  async (type) => {
    const result = await run('*', 'read', type);
    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.matchesControl).toBe(true);
    expect(output.proxyMetrics.upstreamBytesRead).toBe(1);
    expect(output.bounded.records).toBe(1);
  },
);
