const { MAX_BLOCK_SIZE } = require('./bgzf.cjs');

const PSEUDO_BIN = 37450;
const MAX_COORD = 2 ** 29;
const LINEAR_SHIFT = 14;
const EOF_SIZE = 28;
const LEAF_FIRST = 4681;
const N_BINS = 37449;

/**
 * @typedef {import('./indexParser.cjs').ParsedIndex} ParsedIndex
 */

/**
 * @typedef {object} Interval
 * @property {number} tid - Reference index.
 * @property {number} beg - 0-based start.
 * @property {number} end - Exclusive end.
 */

/**
 * @typedef {object} RegionSpec
 * @property {string} contig - Reference name.
 * @property {number} beg    - 0-based start.
 * @property {number} end    - Exclusive end.
 */

/**
 * @typedef {object} PlanOptions
 * @property {ParsedIndex} index           - Parsed index.
 * @property {Interval[]}  intervals       - Resolved query intervals.
 * @property {boolean}     includeUnmapped - Also fetch unplaced (`*`) reads.
 * @property {number}      fileSize        - Remote object size.
 * @property {number}      headerEnd       - Compressed offset where the header blocks end.
 * @property {number}      [mergeGap]      - Largest gap merged into one request.
 */

/**
 * Parses `contig[:start[-end]]` into a half-open interval. The start is widened
 * by one so both 1-based region strings and 0-based BED starts are covered.
 * Like HTSlib, a string that is itself a known contig name wins over parsing,
 * so names such as `HLA-A*01:01` resolve to the whole contig.
 * @param   {string}                    region                 - Region string.
 * @param   {(name: string) => boolean} [isContig=() => false] - Known-contig predicate.
 * @returns {RegionSpec}                                       - Parsed region.
 */
function parseRegion(region, isContig = () => false) {
  const trimmed = region.trim();
  if (trimmed && isContig(trimmed)) {
    return { contig: trimmed, beg: 0, end: MAX_COORD };
  }
  const colon = trimmed.lastIndexOf(':');
  const suffix = colon > 0 ? trimmed.slice(colon + 1).replaceAll(',', '') : '';
  const [first, second, ...rest] = suffix.split('-');
  const isNumber = (/** @type {string|undefined} */ v) =>
    v !== undefined && /^\d+$/.test(v);
  if (
    !isNumber(first) ||
    rest.length > 0 ||
    (second !== undefined && !isNumber(second))
  ) {
    if (!trimmed || /\s/.test(trimmed)) {
      throw new Error(`Invalid region: ${JSON.stringify(region)}`);
    }
    return { contig: trimmed, beg: 0, end: MAX_COORD };
  }
  const start = Number(first);
  const end = second === undefined ? MAX_COORD : Number(second);
  if (end < start) throw new Error(`Invalid region: ${JSON.stringify(region)}`);
  return {
    contig: trimmed.slice(0, colon),
    beg: Math.max(0, start - 1),
    end: Math.min(end, MAX_COORD),
  };
}

/**
 * Lists the bins that may hold records overlapping [beg, end).
 * @param   {number}   beg - 0-based start.
 * @param   {number}   end - Exclusive end.
 * @returns {number[]}     - Bin numbers.
 */
function reg2bins(beg, end) {
  const last = Math.min(Math.max(end, beg + 1), MAX_COORD) - 1;
  const bins = [0];
  for (const [shift, offset] of [
    [26, 1],
    [23, 9],
    [20, 73],
    [17, 585],
    [14, 4681],
  ]) {
    for (let k = offset + (beg >> shift); k <= offset + (last >> shift); k++) {
      bins.push(k);
    }
  }
  return bins;
}

/**
 * Lower bound for HTSlib's `min_off`. HTSlib starts from the linear entry for
 * `beg` and, when the reference has placed unmapped reads, steps back to the
 * nearest smaller entry or the bin's `loff`. Stepping back unconditionally and
 * using 0 when the entry is missing keeps this at or below every HTSlib case.
 * @param   {bigint[]} linear - Linear index.
 * @param   {number}   beg    - 0-based start.
 * @returns {bigint}          - Virtual offset.
 */
function minOffset(linear, beg) {
  const rel = beg >> LINEAR_SHIFT;
  if (rel >= linear.length || linear[rel] === 0n) return 0n;
  for (let i = rel - 1; i >= 0; i--) {
    if (linear[i] < linear[rel]) return linear[i];
  }
  return 0n;
}

/**
 * HTSlib's `max_off`: the first chunk start of the nearest populated bin to the
 * right of `end`. HTSlib never reads chunks at or beyond it.
 * @param   {Map<number, Array<[bigint, bigint]>>} bins - Reference bins.
 * @param   {number}                               end  - Exclusive end.
 * @returns {bigint|null}                               - Offset, or null when unbounded.
 */
function maxOffset(bins, end) {
  if (end >= MAX_COORD) return null;
  let bin = LEAF_FIRST + ((end - 1) >> LINEAR_SHIFT) + 1;
  if (bin >= N_BINS) bin = 0;
  for (;;) {
    while (bin % 8 === 1) bin = (bin - 1) >> 3;
    if (bin === 0) return null;
    const chunks = bins.get(bin);
    if (chunks && chunks.length > 0) return chunks[0][0];
    bin++;
  }
}

/**
 * Extracts the compressed block offset from a virtual offset.
 * @param   {bigint} voffset - BGZF virtual offset.
 * @returns {number}         - Compressed block offset.
 */
const coffset = (voffset) => Number(voffset >> 16n);

/**
 * Yields every real (non pseudo-bin) chunk of an index.
 * @param   {ParsedIndex}                 index - Parsed index.
 * @returns {Generator<[bigint, bigint]>}       - Chunks.
 */
function* allChunks(index) {
  for (const ref of index.refs) {
    for (const [bin, chunks] of ref.bins) {
      if (bin !== PSEUDO_BIN) yield* chunks;
    }
  }
}

/**
 * Sorts ranges and merges those that overlap or sit within `gap` bytes.
 * @param   {Array<[number, number]>} ranges  - Half-open ranges.
 * @param   {number}                  [gap=0] - Largest gap merged away.
 * @returns {Array<[number, number]>}         - Sorted, merged ranges.
 */
function mergeRanges(ranges, gap = 0) {
  /** @type {Array<[number, number]>} */
  const merged = [];
  for (const [start, end] of [...ranges].sort((x, y) => x[0] - y[0])) {
    if (end <= start) continue;
    const previous = merged.at(-1);
    if (previous && start <= previous[1] + gap) {
      previous[1] = Math.max(previous[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

/**
 * Removes already-covered bytes from `ranges`.
 * @param   {Array<[number, number]>} ranges  - Wanted ranges.
 * @param   {Array<[number, number]>} covered - Sorted, merged covered ranges.
 * @returns {Array<[number, number]>}         - Uncovered pieces.
 */
function subtractRanges(ranges, covered) {
  /** @type {Array<[number, number]>} */
  const out = [];
  for (const [start, end] of mergeRanges(ranges)) {
    let cursor = start;
    for (const [cs, ce] of covered) {
      if (ce <= cursor) continue;
      if (cs >= end) break;
      if (cs > cursor) out.push([cursor, cs]);
      cursor = Math.max(cursor, ce);
      if (cursor >= end) break;
    }
    if (cursor < end) out.push([cursor, end]);
  }
  return out;
}

/**
 * @typedef {object} RangePlan
 * @property {Array<[number, number]>} ranges - Sorted, merged byte ranges to fetch.
 * @property {number[]}                blocks - Offsets of BGZF blocks needed in full;
 *                                              their length is read from the block header.
 */

/**
 * Converts a chunk end into the bytes before its block plus, when the chunk ends
 * inside a block, that block. A chunk ending at uncompressed offset 0 ends on a
 * block boundary and HTSlib stops before loading the next block.
 * @param   {bigint}                            v - Chunk end virtual offset.
 * @returns {{end: number, block: number|null}}   - Exclusive byte end and partial end block.
 */
function chunkEnd(v) {
  return { end: coffset(v), block: (v & 0xffffn) === 0n ? null : coffset(v) };
}

/**
 * Bytes covering the VCF header plus the first record, which `tabix -h` reads
 * to find where the header ends.
 * @param   {ParsedIndex}                            index - Parsed TBI.
 * @returns {{end: number, block: number|null}|null}       - Header span, or null when the index has no records.
 */
function vcfHeader(index) {
  /** @type {[bigint, bigint]|undefined} */
  let first;
  for (const chunk of allChunks(index)) {
    if (!first || chunk[0] < first[0]) first = chunk;
  }
  return first ? chunkEnd(first[1]) : null;
}

/**
 * Plans the compressed bytes HTSlib may read for the given intervals: always a
 * superset of HTSlib's chunk list (conservative `min_off`, identical `max_off`).
 * @param   {PlanOptions} options - Planning inputs.
 * @returns {RangePlan}           - Ranges and whole blocks to fetch.
 */
function planRanges({
  index,
  intervals,
  includeUnmapped,
  fileSize,
  headerEnd,
  mergeGap = MAX_BLOCK_SIZE,
}) {
  /** @type {Array<[number, number]>} */
  const ranges = [
    [0, Math.min(headerEnd, fileSize)],
    [Math.max(0, fileSize - EOF_SIZE), fileSize],
  ];
  /** @type {Set<number>} */
  const blocks = new Set();

  for (const { tid, beg, end } of intervals) {
    const ref = index.refs[tid];
    if (!ref) continue;
    const floor = minOffset(ref.linear, beg);
    const ceiling = maxOffset(ref.bins, end);
    for (const bin of reg2bins(beg, end)) {
      if (bin === PSEUDO_BIN) continue;
      for (const [u, v] of ref.bins.get(bin) ?? []) {
        if (v <= floor || (ceiling !== null && u >= ceiling)) continue;
        const last = chunkEnd(ceiling !== null && ceiling < v ? ceiling : v);
        ranges.push([coffset(u > floor ? u : floor), last.end]);
        if (last.block !== null) blocks.add(last.block);
      }
    }
  }

  if (includeUnmapped) {
    let last = -1n;
    for (const [, v] of allChunks(index)) if (v > last) last = v;
    ranges.push([last < 0n ? headerEnd : coffset(last), fileSize]);
  }

  return {
    ranges: mergeRanges(ranges, mergeGap),
    blocks: [...blocks].sort((x, y) => x - y),
  };
}

module.exports = {
  mergeRanges,
  parseRegion,
  planRanges,
  reg2bins,
  subtractRanges,
  vcfHeader,
};
