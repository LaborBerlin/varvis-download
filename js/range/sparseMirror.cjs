const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { MAX_BLOCK_SIZE, inflateBlocks, readBlockSize } = require('./bgzf.cjs');
const { parseBamHeader } = require('./bamHeader.cjs');
const { parseIndexFile } = require('./indexParser.cjs');
const { fetchRange, fetchRanges, isStrongEtag } = require('./rangeFetcher.cjs');
const {
  mergeRanges,
  parseRegion,
  planRanges,
  subtractRanges,
  vcfHeader,
} = require('./rangePlanner.cjs');

const HEADER_WINDOW = 65536;
const MAX_HEADER_WINDOW = 4 * 1024 * 1024;
const MAX_HEADER_BYTES = 64 * 1024 * 1024;
const BLOCK_HEADER_BYTES = 18;
// Gaps up to this size are fetched rather than split into another request.
const MERGE_GAP = 16 * 1024;

/**
 * @typedef {object} MirrorOptions
 * @property {string}                            url             - Signed object URL.
 * @property {string}                            indexPath       - Local .bai or .tbi path.
 * @property {'bam'|'vcf'}                       format          - Object format.
 * @property {string[]}                          regions         - Region strings (`contig[:start[-end]]`).
 * @property {boolean}                           includeUnmapped - Also fetch unplaced reads (BAM).
 * @property {import('../types').HttpDispatcher} [dispatcher]    - Configured dispatcher.
 * @property {Pick<import('winston').Logger, 'debug'>} logger    - Logger.
 * @property {string}                            fileName        - Remote file name.
 */

/**
 * @typedef {object} SparseMirror
 * @property {string} dir       - Private temp directory owning the mirror.
 * @property {string} dataPath  - Sparse local copy of the object.
 * @property {string} indexPath - Index to pass to samtools/tabix.
 * @property {{bytes: number, requests: number, fileSize: number}} stats - Transfer totals.
 */

/**
 * Fetches BGZF header blocks from offset 0 until the BAM header parses.
 * @param   {MirrorOptions & {handle: import('node:fs/promises').FileHandle, identity: {size: number, etag?: string}}}    ctx - Context.
 * @returns {Promise<{header: import('./bamHeader.cjs').BamHeader, fetchedEnd: number, bytes: number, requests: number}>}     - Parsed header and transfer totals.
 */
async function fetchBamHeader({ url, dispatcher, handle, identity }) {
  let fetchedEnd = 1;
  let parsedEnd = 0;
  let decoded = Buffer.alloc(0);
  let window = HEADER_WINDOW;
  let requests = 0;
  for (;;) {
    const end = Math.min(fetchedEnd + window, identity.size);
    if (end <= fetchedEnd || end > MAX_HEADER_BYTES) {
      throw new Error('BAM header could not be parsed from the file start');
    }
    await fetchRange({
      url,
      start: fetchedEnd,
      end,
      dispatcher,
      fileHandle: handle,
      expect: identity,
    });
    requests++;
    fetchedEnd = end;
    const compressed = Buffer.alloc(fetchedEnd - parsedEnd);
    await handle.read(compressed, 0, compressed.length, parsedEnd);
    const { data, consumed } = inflateBlocks(compressed);
    decoded = Buffer.concat([decoded, data]);
    parsedEnd += consumed;
    const header = parseBamHeader(decoded);
    if (header) return { header, fetchedEnd, bytes: fetchedEnd - 1, requests };
    window = Math.min(window * 2, MAX_HEADER_WINDOW);
  }
}

/**
 * Fetches a plan in two passes: the ranges plus each partial end block's
 * header, then the rest of every such block once its length is known.
 * @param   {{url: string, dispatcher?: import('../types').HttpDispatcher, handle: import('node:fs/promises').FileHandle, identity: {size: number, etag?: string}}} ctx     - Transfer context.
 * @param   {import('./rangePlanner.cjs').RangePlan}                                                                                                                plan    - Planned ranges and blocks.
 * @param   {Array<[number, number]>}                                                                                                                               covered - Bytes already in the file.
 * @returns {Promise<{bytes: number, requests: number}>}                                                                                                                    - Transfer totals.
 */
async function fetchPlan({ url, dispatcher, handle, identity }, plan, covered) {
  const request = (/** @type {Array<[number, number]>} */ ranges) =>
    fetchRanges({
      url,
      ranges,
      dispatcher,
      fileHandle: handle,
      expect: identity,
    });
  const headers = plan.blocks.map(
    (c) =>
      /** @type {[number, number]} */ ([
        c,
        Math.min(c + BLOCK_HEADER_BYTES, identity.size),
      ]),
  );
  const first = subtractRanges(
    mergeRanges([...plan.ranges, ...headers], MERGE_GAP),
    covered,
  );
  const a = await request(first);
  const have = mergeRanges([...covered, ...first]);

  /** @type {Array<[number, number]>} */
  const tails = [];
  const header = Buffer.alloc(BLOCK_HEADER_BYTES);
  for (const c of plan.blocks) {
    const { bytesRead } = await handle.read(header, 0, header.length, c);
    const size = readBlockSize(header.subarray(0, bytesRead), 0);
    tails.push([c, Math.min(c + (size ?? MAX_BLOCK_SIZE), identity.size)]);
  }
  const second = subtractRanges(mergeRanges(tails, MERGE_GAP), have);
  const b = await request(second);
  return { bytes: a.bytes + b.bytes, requests: a.requests + b.requests };
}

/**
 * Builds a sparse local copy holding only the bytes HTSlib needs for `regions`.
 * Unfetched bytes are zero, so a planning gap fails BGZF validation loudly.
 * @param   {MirrorOptions}         options - Mirror options.
 * @returns {Promise<SparseMirror>}         - Mirror location and transfer totals.
 */
async function buildSparseMirror(options) {
  const { url, indexPath, format, regions, includeUnmapped, dispatcher } =
    options;
  const index = parseIndexFile(indexPath);
  if (index.format !== (format === 'bam' ? 'bai' : 'tbi')) {
    throw new Error(`Index format ${index.format} does not match ${format}`);
  }
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'varvis-mirror-'));
  const dataPath = path.join(dir, path.basename(options.fileName));
  const handle = await fsp.open(dataPath, 'w+', 0o600);
  try {
    const probe = await fetchRange({
      url,
      start: 0,
      end: 1,
      dispatcher,
      fileHandle: handle,
    });
    // Blocks from different object versions can each pass BGZF CRC checks, so
    // every request is pinned to one version via its strong ETag.
    if (!isStrongEtag(probe.etag)) {
      throw new Error(
        'Remote object has no strong ETag; cannot pin its version across range requests',
      );
    }
    const identity = { size: probe.size, etag: probe.etag };
    await handle.truncate(identity.size);
    let bytes = 1;
    let requests = 1;
    let fetchedEnd = 1;

    /** @type {Map<string, number>} */
    let nameToTid;
    let headerEnd;
    /** @type {number|null} */
    let headerBlock = null;
    if (format === 'bam') {
      const head = await fetchBamHeader({ ...options, handle, identity });
      nameToTid = head.header.nameToTid;
      bytes += head.bytes;
      requests += head.requests;
      fetchedEnd = head.fetchedEnd;
      headerEnd = fetchedEnd;
    } else {
      nameToTid = new Map((index.names ?? []).map((name, tid) => [name, tid]));
      const span = vcfHeader(index);
      headerEnd = span ? span.end : identity.size;
      headerBlock = span ? span.block : null;
    }

    const intervals = [];
    for (const region of regions) {
      const spec = parseRegion(region, (name) => nameToTid.has(name));
      const tid = nameToTid.get(spec.contig);
      if (tid === undefined) {
        options.logger.debug(
          `Region ${region} names an unknown contig; no data planned.`,
        );
        continue;
      }
      intervals.push({ tid, beg: spec.beg, end: spec.end });
    }

    const plan = planRanges({
      index,
      intervals,
      includeUnmapped,
      fileSize: identity.size,
      headerEnd,
      mergeGap: MERGE_GAP,
    });
    if (headerBlock !== null) {
      plan.blocks = [...new Set([...plan.blocks, headerBlock])];
    }
    const totals = await fetchPlan(
      { url, dispatcher, handle, identity },
      plan,
      [[0, fetchedEnd]],
    );
    await handle.close();

    let mirrorIndex = indexPath;
    if (format === 'vcf') {
      mirrorIndex = `${dataPath}.tbi`;
      await fsp.copyFile(indexPath, mirrorIndex);
    }
    // Keep the data older than its index to avoid HTSlib's staleness warning.
    const indexTime = (await fsp.stat(indexPath)).mtime.getTime() / 1000 - 60;
    await fsp.utimes(dataPath, indexTime, indexTime);

    return {
      dir,
      dataPath,
      indexPath: mirrorIndex,
      stats: {
        bytes: bytes + totals.bytes,
        requests: requests + totals.requests,
        fileSize: identity.size,
      },
    };
  } catch (error) {
    await handle.close().catch(() => {});
    await fsp.rm(dir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Removes a mirror's temp directory.
 * @param   {Pick<SparseMirror, 'dir'>} mirror - Mirror to remove.
 * @returns {Promise<void>}
 */
async function removeSparseMirror(mirror) {
  await fsp.rm(mirror.dir, { recursive: true, force: true });
}

module.exports = { buildSparseMirror, removeSparseMirror };
