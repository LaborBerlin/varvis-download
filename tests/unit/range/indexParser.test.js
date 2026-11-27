const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const {
  parseIndex,
  parseIndexFile,
} = require('../../../js/range/indexParser.cjs');
const { buildBai, buildTbi } = require('../../helpers/bgzfFixtures');

const refs = [
  {
    bins: [
      [4681, [[0x10000n, 0x20010n]]],
      [
        0,
        [
          [0x5n, 0x6n],
          [0x7n, 0x8n],
        ],
      ],
    ],
    linear: [0x10000n, 0n],
  },
  { bins: [], linear: [] },
];

describe('range/indexParser', () => {
  test('parses a BAI with bins, chunks and linear index', () => {
    const index = parseIndex(buildBai(refs, 3));
    expect(index.format).toBe('bai');
    expect(index.names).toBeNull();
    expect(index.refs).toHaveLength(2);
    expect(index.refs[0].bins.get(4681)).toEqual([[0x10000n, 0x20010n]]);
    expect(index.refs[0].bins.get(0)).toHaveLength(2);
    expect(index.refs[0].linear).toEqual([0x10000n, 0n]);
    expect(index.refs[1].bins.size).toBe(0);
  });

  test('parses TBI names', () => {
    const index = parseIndex(buildTbi(['chr1', 'chrX'], refs));
    expect(index.format).toBe('tbi');
    expect(index.names).toEqual(['chr1', 'chrX']);
    expect(index.refs[0].linear).toEqual([0x10000n, 0n]);
  });

  test('parseIndexFile gunzips a TBI and reads a raw BAI', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'varvis-idx-'));
    try {
      const tbi = path.join(dir, 'a.vcf.gz.tbi');
      fs.writeFileSync(tbi, zlib.gzipSync(buildTbi(['1', '2'], refs)));
      expect(parseIndexFile(tbi).names).toEqual(['1', '2']);
      const bai = path.join(dir, 'a.bam.bai');
      fs.writeFileSync(bai, buildBai(refs));
      expect(parseIndexFile(bai).format).toBe('bai');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects CSI and unknown formats', () => {
    expect(() => parseIndex(Buffer.from('CSI\x01\0\0\0\0'))).toThrow(
      /unsupported index/i,
    );
  });

  test('rejects truncated or corrupt indexes', () => {
    const bai = buildBai(refs);
    expect(() => parseIndex(bai.subarray(0, bai.length - 3))).toThrow(
      /truncated/i,
    );
    const corrupt = Buffer.from(bai);
    corrupt.writeInt32LE(-5, 8);
    expect(() => parseIndex(corrupt)).toThrow(/corrupt/i);
  });
});
