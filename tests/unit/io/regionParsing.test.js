const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { OperationalError } = require('../../../js/errors.cjs');
const { parseRegions } = require('../../../js/io/regionParsing.cjs');

describe('io/regionParsing.parseRegions', () => {
  const mockLogger = {
    error: jest.fn(),
    info: jest.fn(),
  };

  const created = [];

  // Records a parseRegions result's temp path so afterEach can clean the
  // now-unique per-invocation file (there is no longer a fixed name to rm).
  const track = (result) => {
    if (result.tempBedPath) created.push(result.tempBedPath);
    return result;
  };

  beforeEach(() => {
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
  });

  afterEach(() => {
    for (const p of created.splice(0)) {
      fs.rmSync(p, { force: true });
    }
  });

  test('returns empty regions when neither range nor bed is provided', () => {
    const { regions, tempBedPath } = parseRegions(
      { range: null, bed: null },
      mockLogger,
    );

    expect(regions).toEqual([]);
    expect(tempBedPath).toBeUndefined();
  });

  test('parses chr:start-end range and writes a temp BED file', () => {
    const { regions, tempBedPath } = track(
      parseRegions({ range: 'chr1:100-200', bed: null }, mockLogger),
    );

    expect(regions).toEqual(['chr1:100-200']);
    expect(fs.readFileSync(tempBedPath, 'utf8')).toBe('chr1\t100\t200');
  });

  test('parses chromosome-only range to a full-chromosome BED interval', () => {
    const { regions, tempBedPath } = track(
      parseRegions({ range: 'chr1', bed: null }, mockLogger),
    );

    expect(regions).toEqual(['chr1']);
    expect(fs.readFileSync(tempBedPath, 'utf8')).toBe('chr1\t1\t300000000');
  });

  test('parses space-separated ranges', () => {
    const { regions, tempBedPath } = track(
      parseRegions({ range: 'chr1:1-10 chr2:5-15', bed: null }, mockLogger),
    );

    expect(regions).toEqual(['chr1:1-10', 'chr2:5-15']);
    expect(fs.readFileSync(tempBedPath, 'utf8')).toBe(
      'chr1\t1\t10\nchr2\t5\t15',
    );
  });

  test('parses BED file rows into regions and preserves BED content', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'varvis-bed-'));
    const bedPath = path.join(tempDir, 'input.bed');
    const bedContent = '# comment\nchr1\t10\t20\nchr2\t30\t40\n';
    fs.writeFileSync(bedPath, bedContent);

    const { regions, tempBedPath } = track(
      parseRegions({ range: null, bed: bedPath }, mockLogger),
    );

    expect(regions).toEqual(['chr1:10-20', 'chr2:30-40']);
    expect(fs.readFileSync(tempBedPath, 'utf8')).toBe(bedContent);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('throws OperationalError when BED file cannot be read', () => {
    expect(() =>
      parseRegions({ range: null, bed: '/missing/input.bed' }, mockLogger),
    ).toThrow(OperationalError);
  });

  test('mints a unique temp BED path per call (not a fixed name)', () => {
    const a = track(
      parseRegions({ range: 'chr1:1-10', bed: null }, mockLogger),
    );
    const b = track(
      parseRegions({ range: 'chr1:1-10', bed: null }, mockLogger),
    );

    const fixed = path.join(os.tmpdir(), 'regions.bed');
    expect(a.tempBedPath).not.toBe(fixed);
    expect(b.tempBedPath).not.toBe(fixed);
    expect(a.tempBedPath).not.toBe(b.tempBedPath);
  });

  test('creates temporary BED file with 0600 permissions', () => {
    const writeSpy = jest.spyOn(fs, 'writeFileSync');
    try {
      const { tempBedPath } = parseRegions(
        { range: 'chr1:100-200' },
        mockLogger,
      );
      expect(writeSpy).toHaveBeenCalledWith(
        tempBedPath,
        expect.any(String),
        expect.objectContaining({ mode: 0o600 }),
      );
      const stat = fs.statSync(tempBedPath);
      if (process.platform !== 'win32') {
        expect(stat.mode & 0o777).toBe(0o600);
      }
      fs.unlinkSync(tempBedPath);
    } finally {
      writeSpy.mockRestore();
    }
  });
});
