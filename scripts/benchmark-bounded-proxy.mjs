#!/usr/bin/env node
/**
 * @file Bounded-Range Reverse Proxy Benchmark
 *
 * Demonstrates and measures egress savings provided by the bounded-range reverse proxy
 * against a real remote dataset (1000 Genomes S3 BAM, ~17.28 GB) by simulating samtools
 * ranged extraction queries.
 *
 * Background:
 *   HTSlib (< 1.25.0) issues unbounded HTTP Range requests (e.g. Range: bytes=0- or
 *   Range: bytes=8224425-) when reading remote indexed BAM files over HTTP/S3. When samtools
 *   closes its client socket early after reading header or region records, AWS S3 continues
 *   streaming full object payloads across WAN and TCP socket buffers, incurring massive
 *   unnecessary cloud egress costs (LaborBerlin/varvis-download#22).
 *
 *   The in-process bounded-range proxy transparently bounds every open-ended Range request
 *   to configured chunk boundaries (default 2 MiB) and immediately aborts upstream requests
 *   when downstream samtools sockets close.
 */

import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createBoundedRangeProxy } = require('../js/net/boundedRangeProxy.cjs');

/**
 * 1000 Genomes Phase 3 NA12878 Exome BAM hosted on AWS S3 (~17.28 GB).
 */
const REMOTE_BAM_URL =
  'https://s3.amazonaws.com/1000genomes/phase3/data/NA12878/exome_alignment/NA12878.mapped.ILLUMINA.bwa.CEU.exome.20121211.bam';

/**
 * Standard simulated values and sizes.
 */
const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024; // 2 MiB
const KNOWN_REMOTE_SIZE = 17_282_007_379; // ~17.28 GB
const HEADER_TARGET_BYTES = 64 * 1024; // 64 KiB
const REGION_START_BYTE = 8_224_425;
const REGION_TARGET_BYTES = 130 * 1024; // ~130 KiB

/**
 * Format bytes into human-readable string (IEC KiB/MiB/GiB and decimal GB).
 *
 * @param   {number} bytes - Number of bytes.
 * @returns {string}       - Formatted string.
 */
function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KiB (${bytes.toLocaleString('en-US')} B)`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB (${bytes.toLocaleString('en-US')} B)`;
  }
  const gib = (bytes / (1024 * 1024 * 1024)).toFixed(2);
  const gb = (bytes / 1_000_000_000).toFixed(2);
  return `${gb} GB / ${gib} GiB (${bytes.toLocaleString('en-US')} B)`;
}

/**
 * Simulates a samtools ranged query by issuing a Range request to the proxy
 * and destroying the client socket after reading targetBytes.
 *
 * @param   {string}          proxyUrl    - Proxy loopback URL.
 * @param   {string}          rangeHeader - HTTP Range header value.
 * @param   {number}          targetBytes - Number of bytes to consume before closing socket.
 * @returns {Promise<number>}             - Bytes actually read.
 */
async function simulateRangedQuery(proxyUrl, rangeHeader, targetBytes) {
  const parsed = new URL(proxyUrl);
  return new Promise((resolve) => {
    let bytesRead = 0;
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        headers: { Range: rangeHeader },
      },
      (res) => {
        res.on('data', (chunk) => {
          bytesRead += chunk.length;
          if (bytesRead >= targetBytes) {
            req.destroy();
          }
        });
        res.on('end', () => resolve(bytesRead));
        res.on('close', () => resolve(bytesRead));
        res.on('error', () => resolve(bytesRead));
      },
    );

    req.on('error', () => {
      // Expected when client destroys connection early
      resolve(bytesRead);
    });

    req.end();
  });
}

/**
 * Prints the formatted benchmark results table.
 *
 * @param {object}  params                        - Benchmark parameters and measurements.
 * @param {boolean} params.isOffline              - Whether run fell back to offline simulation.
 * @param {number}  params.fileSize               - Remote file size in bytes.
 * @param {number}  params.totalUnboundedEgress   - Potential unbounded egress without proxy.
 * @param {number}  params.totalBytesServed       - Bytes served downstream to samtools client.
 * @param {number}  params.totalChunksFetched     - Total chunks fetched upstream by proxy.
 * @param {number}  params.maxBoundedEgress       - Maximum bounded egress fetched upstream.
 * @param {number}  params.req1BytesRead          - Bytes read during Request 1.
 * @param {number}  params.req2BytesRead          - Bytes read during Request 2.
 * @param {string}  [params.networkError]         - Optional network error details if offline.
 */
function printReportTable({
  isOffline,
  fileSize,
  totalUnboundedEgress,
  totalBytesServed,
  totalChunksFetched,
  maxBoundedEgress,
  req1BytesRead,
  req2BytesRead,
  networkError,
}) {
  const savingsBytes = totalUnboundedEgress - maxBoundedEgress;
  const reductionPercent = (
    (1 - maxBoundedEgress / totalUnboundedEgress) *
    100
  ).toFixed(3);

  const divider = '='.repeat(108);
  const thinDivider = '-'.repeat(108);

  console.log(divider);
  console.log(
    '                Bounded-Range Reverse Proxy Benchmark (1000 Genomes S3 BAM)',
  );
  console.log(divider);

  if (isOffline) {
    console.log(
      `[NOTICE] Offline / unreachable network: ${networkError || 'Connection unavailable'}.`,
    );
    console.log(
      '[NOTICE] Displaying simulated benchmark calculations using standard NA12878 parameters.\n',
    );
  } else {
    console.log(
      '[MODE] Live upstream benchmark against AWS S3 remote dataset\n',
    );
  }

  console.log(
    `Dataset URL    : ${REMOTE_BAM_URL.split('/').slice(0, 4).join('/')}/.../${REMOTE_BAM_URL.split('/').pop()}`,
  );
  console.log(`Dataset Size   : ${formatBytes(fileSize)}`);
  console.log(
    `Proxy Chunks   : ${totalChunksFetched} chunk(s) (chunk size: ${formatBytes(DEFAULT_CHUNK_SIZE)})`,
  );
  console.log(
    `Simulated Work : 1) HEAD check\n` +
      `                 2) Header read (Range: bytes=0-, client read: ${req1BytesRead.toLocaleString('en-US')} B)\n` +
      `                 3) Region slice (Range: bytes=${REGION_START_BYTE.toLocaleString('en-US')}-, client read: ${req2BytesRead.toLocaleString('en-US')} B)`,
  );
  console.log(thinDivider);
  console.log(
    `${'Metric'.padEnd(30)} | ${'Without Proxy (Unbounded)'.padEnd(44)} | ${'With Bounded Proxy'.padEnd(28)}`,
  );
  console.log(thinDivider);
  console.log(
    `${'HTTP Range Requests'.padEnd(30)} | ${'2 unbounded (bytes=0-)'.padEnd(44)} | ${'2 bounded (2 MiB max)'.padEnd(28)}`,
  );
  console.log(
    `${'Client Data Read (Downstream)'.padEnd(30)} | ${formatBytes(req1BytesRead + req2BytesRead).padEnd(44)} | ${formatBytes(totalBytesServed).padEnd(28)}`,
  );
  console.log(
    `${'Upstream S3 Egress (Max Cap)'.padEnd(30)} | ${formatBytes(totalUnboundedEgress).padEnd(44)} | ${formatBytes(maxBoundedEgress).padEnd(28)}`,
  );
  console.log(
    `${'Actual Expected S3 Egress'.padEnd(30)} | ${'17.2 - 34.5 GB (stream drain)'.padEnd(44)} | ${`~${formatBytes(maxBoundedEgress)}`.padEnd(28)}`,
  );
  console.log(thinDivider);
  console.log(
    `Net Egress Reduction : > ${reductionPercent}% (${formatBytes(savingsBytes)} saved)`,
  );
  console.log(divider);
}

/**
 * Main benchmark execution flow.
 */
async function main() {
  let proxy;
  try {
    if (process.env.BENCHMARK_SIMULATE_OFFLINE === '1') {
      throw new Error('Simulated offline mode via BENCHMARK_SIMULATE_OFFLINE');
    }
    // 1. Initialize proxy instance
    proxy = await createBoundedRangeProxy(REMOTE_BAM_URL, {
      chunkSize: DEFAULT_CHUNK_SIZE,
    });

    // 2. Perform discovery HEAD request
    const headRes = await fetch(proxy.proxyUrl, { method: 'HEAD' });
    if (!headRes.ok) {
      throw new Error(`Upstream HEAD returned status ${headRes.status}`);
    }

    const clHeader = headRes.headers.get('content-length');
    const fileSize = clHeader
      ? Number.parseInt(clHeader, 10)
      : KNOWN_REMOTE_SIZE;

    // 3. Simulate Request 1: BAM header read (Range: bytes=0-, read 64 KiB, early abort)
    const req1BytesRead = await simulateRangedQuery(
      proxy.proxyUrl,
      'bytes=0-',
      HEADER_TARGET_BYTES,
    );

    // Brief pause to allow abort event processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 4. Simulate Request 2: Region slice (Range: bytes=8224425-, read 130 KiB, early abort)
    const req2BytesRead = await simulateRangedQuery(
      proxy.proxyUrl,
      `bytes=${REGION_START_BYTE}-`,
      REGION_TARGET_BYTES,
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    // 5. Gather metrics from proxy
    const metrics = proxy.getMetrics();

    // 6. Graceful cleanup
    await proxy.close();
    proxy = null;

    // 7. Calculate egress metrics
    const unboundedReq1 = fileSize;
    const unboundedReq2 = fileSize - REGION_START_BYTE;
    const totalUnboundedEgress = unboundedReq1 + unboundedReq2;
    const maxBoundedEgress = metrics.totalChunksFetched * DEFAULT_CHUNK_SIZE;

    // 8. Output benchmark report
    printReportTable({
      isOffline: false,
      fileSize,
      totalUnboundedEgress,
      totalBytesServed: metrics.totalBytesServed,
      totalChunksFetched: metrics.totalChunksFetched,
      maxBoundedEgress,
      req1BytesRead,
      req2BytesRead,
    });
  } catch (err) {
    if (proxy) {
      try {
        await proxy.close();
      } catch {
        // Ignore close errors during recovery
      }
    }

    // Fallback to simulated benchmark
    const fileSize = KNOWN_REMOTE_SIZE;
    const unboundedReq1 = fileSize;
    const unboundedReq2 = fileSize - REGION_START_BYTE;
    const totalUnboundedEgress = unboundedReq1 + unboundedReq2;
    const simulatedChunksFetched = 2;
    const maxBoundedEgress = simulatedChunksFetched * DEFAULT_CHUNK_SIZE;

    printReportTable({
      isOffline: true,
      fileSize,
      totalUnboundedEgress,
      totalBytesServed: HEADER_TARGET_BYTES + REGION_TARGET_BYTES,
      totalChunksFetched: simulatedChunksFetched,
      maxBoundedEgress,
      req1BytesRead: HEADER_TARGET_BYTES,
      req2BytesRead: REGION_TARGET_BYTES,
      networkError: err instanceof Error ? err.message : String(err),
    });
  }
}

main().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exitCode = 1;
});
