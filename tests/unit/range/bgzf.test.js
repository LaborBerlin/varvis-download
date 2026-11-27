const zlib = require('node:zlib');
const {
  BGZF_EOF,
  MAX_BLOCK_SIZE,
  inflateBlocks,
  readBlockSize,
} = require('../../../js/range/bgzf.cjs');
const { bgzfBlock } = require('../../helpers/bgzfFixtures');

describe('range/bgzf', () => {
  test('readBlockSize returns the total block length', () => {
    const block = bgzfBlock(Buffer.from('hello world'));
    expect(readBlockSize(block, 0)).toBe(block.length);
  });

  test('readBlockSize returns null for an incomplete header', () => {
    const block = bgzfBlock(Buffer.from('abc'));
    expect(readBlockSize(block.subarray(0, 10), 0)).toBeNull();
  });

  test('readBlockSize rejects non-BGZF bytes', () => {
    expect(() => readBlockSize(Buffer.alloc(32), 0)).toThrow(/BGZF/);
    const gzip = zlib.gzipSync(Buffer.from('plain gzip'));
    expect(() => readBlockSize(gzip, 0)).toThrow(/BGZF/);
  });

  test('inflateBlocks decodes complete blocks and ignores a partial tail', () => {
    const a = bgzfBlock(Buffer.from('first-'));
    const b = bgzfBlock(Buffer.from('second'));
    const joined = Buffer.concat([a, b]);
    expect(inflateBlocks(joined)).toEqual({
      data: Buffer.from('first-second'),
      consumed: joined.length,
    });
    expect(inflateBlocks(joined.subarray(0, a.length + 5))).toEqual({
      data: Buffer.from('first-'),
      consumed: a.length,
    });
  });

  test('the EOF marker is an empty BGZF block', () => {
    expect(BGZF_EOF).toHaveLength(28);
    expect(readBlockSize(BGZF_EOF, 0)).toBe(28);
    expect(inflateBlocks(BGZF_EOF).data).toHaveLength(0);
    expect(MAX_BLOCK_SIZE).toBe(65536);
  });
});
