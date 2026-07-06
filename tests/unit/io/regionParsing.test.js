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

  beforeEach(() => {
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
  });

  afterEach(() => {
    fs.rmSync(path.join(os.tmpdir(), 'regions.bed'), { force: true });
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
    const { regions, tempBedPath } = parseRegions(
      { range: 'chr1:100-200', bed: null },
      mockLogger,
    );

    expect(regions).toEqual(['chr1:100-200']);
    expect(fs.readFileSync(tempBedPath, 'utf8')).toBe('chr1\t100\t200');
  });

  test('parses chromosome-only range to a full-chromosome BED interval', () => {
    const { regions, tempBedPath } = parseRegions(
      { range: 'chr1', bed: null },
      mockLogger,
    );

    expect(regions).toEqual(['chr1']);
    expect(fs.readFileSync(tempBedPath, 'utf8')).toBe('chr1\t1\t300000000');
  });

  test('parses space-separated ranges', () => {
    const { regions, tempBedPath } = parseRegions(
      { range: 'chr1:1-10 chr2:5-15', bed: null },
      mockLogger,
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

    const { regions, tempBedPath } = parseRegions(
      { range: null, bed: bedPath },
      mockLogger,
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
});
