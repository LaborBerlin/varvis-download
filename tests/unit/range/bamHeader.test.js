const { parseBamHeader } = require('../../../js/range/bamHeader.cjs');
const { buildBamHeader } = require('../../helpers/bgzfFixtures');

describe('range/bamHeader', () => {
  const text =
    '@HD\tVN:1.6\tSO:coordinate\n' +
    '@SQ\tSN:chr1\tLN:1000\tAN:1,NC_000001.11\n' +
    '@SQ\tSN:chr2\tLN:500\tAN:chr1\n';
  const bytes = buildBamHeader(text, [
    ['chr1', 1000],
    ['chr2', 500],
  ]);

  test('maps names and aliases to tids', () => {
    const header = parseBamHeader(bytes);
    expect(header?.names).toEqual(['chr1', 'chr2']);
    expect(header?.nameToTid.get('chr2')).toBe(1);
    expect(header?.nameToTid.get('1')).toBe(0);
    expect(header?.nameToTid.get('NC_000001.11')).toBe(0);
  });

  test('an alias never overrides a primary name', () => {
    expect(parseBamHeader(bytes)?.nameToTid.get('chr1')).toBe(0);
  });

  test('returns null until the header is complete', () => {
    for (const cut of [3, 10, bytes.length - 1]) {
      expect(parseBamHeader(bytes.subarray(0, cut))).toBeNull();
    }
    expect(parseBamHeader(Buffer.concat([bytes, Buffer.alloc(10)]))).not.toBe(
      null,
    );
  });

  test('rejects non-BAM data', () => {
    expect(() => parseBamHeader(Buffer.from('##fileformat=VCF'))).toThrow(
      /Not a BAM/,
    );
  });
});
