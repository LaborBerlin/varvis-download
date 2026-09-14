#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const require = createRequire(import.meta.url);
const { request } = require('undici');
const { createBoundedRangeProxy } = require('../js/net/boundedRangeProxy.cjs');
const { redactToolText } = require('../js/download/toolDiagnostics.cjs');
const {
  DEFAULT_CHUNK_SIZE,
  validateChunkSize,
} = require('../js/net/rangeProtocol.cjs');

function extract(tool, args, cwd) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const hash = createHash('sha256');
    let records = 0;
    let stderr = '';
    const child = spawn(tool, args, { cwd });
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);
    child.stdout.on('data', (bytes) => {
      hash.update(bytes);
      for (const byte of bytes) if (byte === 10) records++;
    });
    child.stderr.on('data', (bytes) => {
      stderr = (stderr + bytes.toString()).slice(0, 16_384);
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(new Error(`Could not start ${tool}; check that it is installed.`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(`${tool} failed (${code}): ${redactToolText(stderr)}`),
        );
        return;
      }
      resolve({
        records,
        sha256: hash.digest('hex'),
        milliseconds: Math.round(performance.now() - started),
      });
    });
  });
}

async function benchmark() {
  const url = process.env.BENCHMARK_URL;
  const indexUrl = process.env.BENCHMARK_INDEX_URL;
  const region = process.env.BENCHMARK_REGION;
  const type = process.env.BENCHMARK_TYPE || 'bam';
  if (!url || !indexUrl || !region || !['bam', 'vcf'].includes(type)) {
    throw new Error(
      'Set BENCHMARK_URL, BENCHMARK_INDEX_URL, BENCHMARK_REGION and BENCHMARK_TYPE=bam|vcf. Requires samtools or tabix.',
    );
  }
  if (region.trim().startsWith('-')) {
    throw new Error(
      'BENCHMARK_REGION must be a region or *, not a tool option.',
    );
  }
  const chunkSize = validateChunkSize(
    process.env.BENCHMARK_CHUNK_SIZE === undefined
      ? DEFAULT_CHUNK_SIZE
      : Number(process.env.BENCHMARK_CHUNK_SIZE),
  );
  const directory = await mkdtemp(
    path.join(tmpdir(), 'varvis-range-benchmark-'),
  );
  let proxy;
  try {
    const indexPath = path.join(
      directory,
      path.posix.basename(new URL(url).pathname) +
        (type === 'bam' ? '.bai' : '.tbi'),
    );
    const response = await request(indexUrl, {
      headers: { 'accept-encoding': 'identity' },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.statusCode !== 200) {
      response.body.destroy();
      throw new Error(`Index download returned HTTP ${response.statusCode}`);
    }
    await pipeline(
      response.body,
      createWriteStream(indexPath, { mode: 0o600 }),
    );
    const tool = type === 'bam' ? 'samtools' : 'tabix';
    const args = (source) =>
      type === 'bam'
        ? ['view', '--no-PG', '-X', '--', source, indexPath, region]
        : ['--', source, region];
    const direct = await extract(tool, args(url), directory);
    if (direct.records === 0)
      throw new Error(
        'The control region has no records. Choose a populated region.',
      );
    proxy = await createBoundedRangeProxy(url, { chunkSize });
    const bounded = await extract(tool, args(proxy.proxyUrl), directory);
    await proxy.close();
    const proxyMetrics = proxy.getMetrics();
    if (
      proxyMetrics.upstreamBytesRead === 0 ||
      proxyMetrics.totalBytesServed === 0
    ) {
      throw new Error(
        'The proxy did not read and serve source data; comparison is invalid.',
      );
    }
    const matchesControl = direct.sha256 === bounded.sha256;
    console.log(
      JSON.stringify(
        {
          type,
          region,
          chunkSize,
          direct,
          bounded,
          matchesControl,
          proxyMetrics,
          measurement:
            'Proxy HTTP body bytes only. Direct transport bytes and provider-billed egress are not measured.',
        },
        null,
        2,
      ),
    );
    if (!matchesControl)
      throw new Error('Decoded records differ from the direct control.');
  } finally {
    await proxy?.close();
    await rm(directory, { recursive: true, force: true });
  }
}

benchmark().catch((error) => {
  console.error(redactToolText(error.message));
  process.exitCode = 1;
});
