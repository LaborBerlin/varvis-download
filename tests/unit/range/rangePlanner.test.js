const {
  mergeRanges,
  parseRegion,
  planRanges,
  reg2bins,
  subtractRanges,
  vcfHeader,
} = require('../../../js/range/rangePlanner.cjs');

/** Virtual offset from a compressed and uncompressed offset. */
const vo = (c, u = 0) => (BigInt(c) << 16n) | BigInt(u);

/**
 * Builds a one-reference ParsedIndex.
 * @param {Array<[number, Array<[bigint, bigint]>]>} bins   - Bins.
 * @param {bigint[]}                                 linear - Linear index.
 */
const indexOf = (bins, linear = []) => ({
  format: 'bai',
  names: null,
  refs: [{ bins: new Map(bins), linear }],
});

const MB = 1_000_000;

describe('range/rangePlanner.parseRegion', () => {
  test.each([
    ['chr1', { contig: 'chr1', beg: 0, end: 2 ** 29 }],
    ['chr1:100-200', { contig: 'chr1', beg: 99, end: 200 }],
    ['chr1:1,000-2,000', { contig: 'chr1', beg: 999, end: 2000 }],
    ['chr1:100', { contig: 'chr1', beg: 99, end: 2 ** 29 }],
    ['chr1:0-10', { contig: 'chr1', beg: 0, end: 10 }],
  ])('%s', (input, expected) => {
    expect(parseRegion(input)).toEqual(expected);
  });

  test('a known contig name containing a colon wins over parsing', () => {
    const isContig = (name) => name === 'HLA-A*01:01';
    expect(parseRegion('HLA-A*01:01', isContig)).toEqual({
      contig: 'HLA-A*01:01',
      beg: 0,
      end: 2 ** 29,
    });
    expect(parseRegion('HLA-A*01:01:5-9', isContig)).toEqual({
      contig: 'HLA-A*01:01',
      beg: 4,
      end: 9,
    });
  });

  test.each(['', 'chr1:200-100', 'chr 1'])('rejects %j', (input) => {
    expect(() => parseRegion(input)).toThrow(/Invalid region/);
  });
});

describe('range/rangePlanner.reg2bins', () => {
  test('covers every level for a small interval', () => {
    expect(reg2bins(0, 1)).toEqual([0, 1, 9, 73, 585, 4681]);
    expect(reg2bins(16384, 16385)).toContain(4682);
  });
});

describe('range/rangePlanner.planRanges', () => {
  const base = { includeUnmapped: false, fileSize: 10 * MB, headerEnd: 100 };
  const plan = (index, intervals, extra = {}) =>
    planRanges({ ...base, index, intervals, mergeGap: 0, ...extra });

  test('always includes the header and EOF marker', () => {
    expect(plan(indexOf([]), [])).toEqual({
      ranges: [
        [0, 100],
        [10 * MB - 28, 10 * MB],
      ],
      blocks: [],
    });
  });

  test('a chunk ending inside a block requests that whole block', () => {
    const result = plan(indexOf([[4681, [[vo(1 * MB), vo(2 * MB, 5)]]]]), [
      { tid: 0, beg: 0, end: 100 },
    ]);
    expect(result.ranges).toContainEqual([1 * MB, 2 * MB]);
    expect(result.blocks).toEqual([2 * MB]);
  });

  test('a chunk ending on a block boundary needs no extra block', () => {
    const result = plan(indexOf([[4681, [[vo(1 * MB), vo(2 * MB, 0)]]]]), [
      { tid: 0, beg: 0, end: 100 },
    ]);
    expect(result.ranges).toContainEqual([1 * MB, 2 * MB]);
    expect(result.blocks).toEqual([]);
  });

  test('drops chunks ending before min_off and clips starts to it', () => {
    const index = indexOf(
      [
        [
          0,
          [
            [vo(2 * MB), vo(2 * MB + 200)],
            [vo(4 * MB), vo(6 * MB, 1)],
          ],
        ],
      ],
      [vo(3 * MB), vo(5 * MB)],
    );
    // Window 1 has linear 5 MB; the smaller previous entry (3 MB) is min_off.
    const { ranges } = plan(index, [{ tid: 0, beg: 16384, end: 16400 }], {
      headerEnd: 10,
    });
    expect(ranges.some(([s]) => s === 2 * MB)).toBe(false);
    expect(ranges).toContainEqual([4 * MB, 6 * MB]);
  });

  test('plans from 0 when no smaller earlier linear entry exists', () => {
    const index = indexOf(
      [[0, [[vo(1 * MB), vo(1 * MB + 50, 3)]]]],
      [vo(5 * MB)],
    );
    // HTSlib may fall back to the bin loff here, so nothing is trimmed.
    const { ranges } = plan(index, [{ tid: 0, beg: 10, end: 20 }], {
      headerEnd: 10,
    });
    expect(ranges).toContainEqual([1 * MB, 1 * MB + 50]);
  });

  test('uses no floor for zero or missing linear entries', () => {
    const index = indexOf(
      [[0, [[vo(1 * MB), vo(6 * MB, 1)]]]],
      [vo(3 * MB), 0n, 0n],
    );
    for (const beg of [2 * 16384, 50 * 16384]) {
      const { ranges } = plan(index, [{ tid: 0, beg, end: beg + 10 }], {
        headerEnd: 10,
      });
      expect(ranges).toContainEqual([1 * MB, 6 * MB]);
    }
  });

  test('applies HTSlib max_off from the next populated bin to the right', () => {
    const index = indexOf([
      [
        0,
        [
          [vo(1 * MB), vo(3 * MB, 9)],
          [vo(5 * MB), vo(6 * MB, 9)],
        ],
      ],
      [4681, [[vo(1 * MB), vo(1 * MB + 500, 9)]]],
      [4682, [[vo(2 * MB, 4), vo(2 * MB + 900, 9)]]],
    ]);
    const result = plan(index, [{ tid: 0, beg: 0, end: 100 }], {
      headerEnd: 10,
    });
    // Clipped at max_off (2 MB, inside a block); the later chunk is dropped.
    expect(result.ranges).toContainEqual([1 * MB, 2 * MB]);
    expect(result.ranges.some(([s]) => s === 5 * MB)).toBe(false);
    expect(result.blocks).toEqual([1 * MB + 500, 2 * MB]);
  });

  test('ignores the pseudo-bin and unknown references', () => {
    const index = indexOf([[37450, [[vo(7 * MB), vo(8 * MB)]]]]);
    const { ranges } = plan(index, [
      { tid: 0, beg: 0, end: 100 },
      { tid: 5, beg: 0, end: 100 },
    ]);
    expect(ranges).toHaveLength(2);
  });

  test('fetches unmapped reads from the last mapped chunk to EOF', () => {
    const index = indexOf([
      [4681, [[vo(1 * MB), vo(3 * MB, 7)]]],
      [37450, [[vo(1 * MB), vo(9 * MB)]]],
    ]);
    const { ranges } = plan(index, [], { includeUnmapped: true });
    expect(ranges.at(-1)).toEqual([3 * MB, 10 * MB]);
  });

  test('merges ranges separated by at most the merge gap', () => {
    const index = indexOf([
      [
        4681,
        [
          [vo(1 * MB), vo(1 * MB + 10)],
          [vo(1 * MB + 50_000), vo(1 * MB + 50_010)],
          [vo(3 * MB), vo(3 * MB + 10)],
        ],
      ],
    ]);
    const { ranges } = plan(index, [{ tid: 0, beg: 0, end: 10 }], {
      mergeGap: 65536,
    });
    expect(ranges).toEqual([
      [0, 100],
      [1 * MB, 1 * MB + 50_010],
      [3 * MB, 3 * MB + 10],
      [10 * MB - 28, 10 * MB],
    ]);
  });
});

describe('range/rangePlanner helpers', () => {
  test('mergeRanges sorts, merges and drops empty ranges', () => {
    expect(
      mergeRanges(
        [
          [10, 20],
          [0, 5],
          [5, 7],
          [30, 30],
          [22, 25],
        ],
        2,
      ),
    ).toEqual([
      [0, 7],
      [10, 25],
    ]);
  });

  test('subtractRanges returns only uncovered pieces', () => {
    expect(
      subtractRanges(
        [
          [0, 100],
          [150, 160],
        ],
        [
          [10, 20],
          [50, 155],
        ],
      ),
    ).toEqual([
      [0, 10],
      [20, 50],
      [155, 160],
    ]);
  });

  test('vcfHeader covers the chunk holding the first record', () => {
    const index = indexOf([
      [
        4681,
        [
          [vo(5000), vo(9000, 12)],
          [vo(20000), vo(30000)],
        ],
      ],
    ]);
    expect(vcfHeader(index)).toEqual({ end: 9000, block: 9000 });
    expect(vcfHeader(indexOf([]))).toBeNull();
  });
});
