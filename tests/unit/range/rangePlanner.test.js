const {
  createBlockBound,
  parseRegion,
  planRanges,
  reg2bins,
  vcfHeaderEnd,
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

  test('always includes the header and EOF marker', () => {
    expect(planRanges({ ...base, index: indexOf([]), intervals: [] })).toEqual([
      [0, 100],
      [10 * MB - 28, 10 * MB],
    ]);
  });

  test('fetches a leaf-bin chunk up to the next known block start', () => {
    const index = indexOf(
      [[4681, [[vo(1 * MB), vo(2 * MB, 5)]]]],
      [vo(1 * MB)],
    );
    // A known block start 30 KB after the chunk end tightens the bound.
    index.refs[0].bins.set(4682, [[vo(2 * MB + 30000), vo(3 * MB)]]);
    const ranges = planRanges({
      ...base,
      index,
      intervals: [{ tid: 0, beg: 0, end: 100 }],
    });
    expect(ranges).toContainEqual([1 * MB, 2 * MB + 30000]);
  });

  test('caps the end block at 64 KiB when no later offset is known', () => {
    const index = indexOf([[4681, [[vo(1 * MB), vo(2 * MB)]]]]);
    const ranges = planRanges({
      ...base,
      index,
      intervals: [{ tid: 0, beg: 0, end: 100 }],
    });
    expect(ranges).toContainEqual([1 * MB, 2 * MB + 65536]);
  });

  test('uses parent bins and trims chunks ending before the linear minimum', () => {
    const index = indexOf(
      [
        [
          0,
          [
            [vo(200), vo(300)],
            [vo(5 * MB), vo(5 * MB + 1000)],
          ],
        ],
      ],
      [vo(4 * MB)],
    );
    const ranges = planRanges({
      ...base,
      index,
      intervals: [{ tid: 0, beg: 10, end: 20 }],
    });
    expect(ranges.some(([s]) => s === 200)).toBe(false);
    expect(ranges.some(([s]) => s === 5 * MB)).toBe(true);
  });

  test('clips chunk starts to the linear minimum', () => {
    const index = indexOf(
      [[0, [[vo(1 * MB), vo(6 * MB)]]]],
      [vo(1 * MB), vo(4 * MB)],
    );
    const ranges = planRanges({
      ...base,
      index,
      intervals: [{ tid: 0, beg: 16384, end: 16400 }],
    });
    expect(ranges.find(([, e]) => e > 5 * MB)?.[0]).toBe(4 * MB);
  });

  test('steps back over zero linear entries and past the linear end', () => {
    const index = indexOf(
      [[0, [[vo(1 * MB), vo(6 * MB)]]]],
      [vo(3 * MB), 0n, 0n],
    );
    for (const beg of [2 * 16384, 50 * 16384]) {
      const ranges = planRanges({
        ...base,
        index,
        intervals: [{ tid: 0, beg, end: beg + 10 }],
      });
      expect(ranges.find(([, e]) => e > 5 * MB)?.[0]).toBe(3 * MB);
    }
  });

  test('ignores the pseudo-bin and unknown references', () => {
    const index = indexOf([[37450, [[vo(7 * MB), vo(8 * MB)]]]]);
    const ranges = planRanges({
      ...base,
      index,
      intervals: [
        { tid: 0, beg: 0, end: 100 },
        { tid: 5, beg: 0, end: 100 },
      ],
    });
    expect(ranges).toHaveLength(2);
  });

  test('fetches unmapped reads from the last mapped chunk to EOF', () => {
    const index = indexOf([
      [4681, [[vo(1 * MB), vo(3 * MB, 7)]]],
      [37450, [[vo(1 * MB), vo(9 * MB)]]],
    ]);
    const ranges = planRanges({
      ...base,
      index,
      intervals: [],
      includeUnmapped: true,
    });
    expect(ranges.at(-1)).toEqual([3 * MB, 10 * MB]);
  });

  test('merges ranges separated by at most the merge gap', () => {
    const index = indexOf([
      [
        4681,
        [
          [vo(1 * MB), vo(1 * MB + 10)],
          [vo(1 * MB + 100_000), vo(1 * MB + 100_010)],
          [vo(3 * MB), vo(3 * MB + 10)],
        ],
      ],
    ]);
    const ranges = planRanges({
      ...base,
      index,
      intervals: [{ tid: 0, beg: 0, end: 10 }],
      mergeGap: 65536,
    });
    const starts = ranges.map(([s]) => s);
    expect(starts).toEqual([0, 1 * MB, 3 * MB, 10 * MB - 28]);
  });
});

describe('range/rangePlanner helpers', () => {
  test('createBlockBound never exceeds the file size', () => {
    expect(createBlockBound(indexOf([]), 1000)(990)).toBe(1000);
  });

  test('vcfHeaderEnd covers the chunk holding the first record', () => {
    const index = indexOf([
      [
        4681,
        [
          [vo(5000), vo(9000, 12)],
          [vo(20000), vo(30000)],
        ],
      ],
    ]);
    expect(vcfHeaderEnd(index, MB)).toBe(20000);
    expect(vcfHeaderEnd(indexOf([]), MB)).toBe(MB);
  });
});
