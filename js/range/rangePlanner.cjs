const { MAX_BLOCK_SIZE } = require('./bgzf.cjs');

const PSEUDO_BIN = 37450;
const MAX_COORD = 2 ** 29;
const LINEAR_SHIFT = 14;
const EOF_SIZE = 28;

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
 * Lower bound for the first record overlapping `beg`, never above HTSlib's.
 * @param   {bigint[]} linear - Linear index.
 * @param   {number}   beg    - 0-based start.
 * @returns {bigint}          - Virtual offset.
 */
function minOffset(linear, beg) {
  let i = Math.min(beg >> LINEAR_SHIFT, linear.length - 1);
  while (i >= 0 && linear[i] === 0n) i--;
  return i >= 0 ? linear[i] : 0n;
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
 * Builds a function returning an upper bound for the end of the block at `c`:
 * the next block start the index knows about, capped by the maximum block size.
 * @param   {ParsedIndex}           index    - Parsed index.
 * @param   {number}                fileSize - Remote object size.
 * @returns {(c: number) => number}          - Block end bound.
 */
function createBlockBound(index, fileSize) {
  const known = new Set([fileSize]);
  for (const [u, v] of allChunks(index)) {
    known.add(coffset(u));
    known.add(coffset(v));
  }
  for (const ref of index.refs) {
    for (const offset of ref.linear) known.add(coffset(offset));
  }
  const starts = [...known].sort((a, b) => a - b);
  return (c) => {
    let lo = 0;
    let hi = starts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] > c) hi = mid;
      else lo = mid + 1;
    }
    const next = lo < starts.length ? starts[lo] : fileSize;
    return Math.min(next, c + MAX_BLOCK_SIZE, fileSize);
  };
}

/**
 * Compressed offset covering the VCF header plus the first record, which
 * `tabix -h` reads to find the header end.
 * @param   {ParsedIndex} index    - Parsed TBI.
 * @param   {number}      fileSize - Remote object size.
 * @returns {number}               - Exclusive end of the header range.
 */
function vcfHeaderEnd(index, fileSize) {
  /** @type {[bigint, bigint]|undefined} */
  let first;
  for (const chunk of allChunks(index)) {
    if (!first || chunk[0] < first[0]) first = chunk;
  }
  if (!first) return fileSize;
  return createBlockBound(index, fileSize)(coffset(first[1]));
}

/**
 * Plans the compressed byte ranges HTSlib may read for the given intervals.
 * @param   {PlanOptions}             options - Planning inputs.
 * @returns {Array<[number, number]>}         - Sorted, merged half-open byte ranges.
 */
function planRanges({
  index,
  intervals,
  includeUnmapped,
  fileSize,
  headerEnd,
  mergeGap = MAX_BLOCK_SIZE,
}) {
  const blockEnd = createBlockBound(index, fileSize);
  /** @type {Array<[number, number]>} */
  const ranges = [
    [0, Math.min(headerEnd, fileSize)],
    [Math.max(0, fileSize - EOF_SIZE), fileSize],
  ];

  for (const { tid, beg, end } of intervals) {
    const ref = index.refs[tid];
    if (!ref) continue;
    const floor = minOffset(ref.linear, beg);
    for (const bin of reg2bins(beg, end)) {
      for (const [u, v] of ref.bins.get(bin) ?? []) {
        if (v <= floor) continue;
        const start = coffset(u > floor ? u : floor);
        ranges.push([start, blockEnd(coffset(v))]);
      }
    }
  }

  if (includeUnmapped) {
    let last = -1n;
    for (const [, v] of allChunks(index)) if (v > last) last = v;
    ranges.push([last < 0n ? headerEnd : coffset(last), fileSize]);
  }

  ranges.sort((a, b) => a[0] - b[0]);
  /** @type {Array<[number, number]>} */
  const merged = [];
  for (const [start, end] of ranges) {
    if (end <= start) continue;
    const previous = merged.at(-1);
    if (previous && start <= previous[1] + mergeGap) {
      previous[1] = Math.max(previous[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

module.exports = {
  createBlockBound,
  parseRegion,
  planRanges,
  reg2bins,
  vcfHeaderEnd,
};
