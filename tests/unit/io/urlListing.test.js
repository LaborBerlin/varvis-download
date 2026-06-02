const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { handleUrlListing } = require('../../../js/io/urlListing.cjs');

describe('io/urlListing.handleUrlListing', () => {
  const mockLogger = {
    error: jest.fn(),
    info: jest.fn(),
  };

  beforeEach(() => {
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
  });

  test('logs info when there are no URLs to list', () => {
    handleUrlListing([], null, mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('No files matching'),
    );
  });

  test('prints URLs to stdout and writes them to a file', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'varvis-urls-'));
    const filePath = path.join(tempDir, 'urls.txt');
    const urls = ['https://a.example/1', 'https://b.example/2'];
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    handleUrlListing(urls, filePath, mockLogger);

    expect(consoleSpy).toHaveBeenCalledWith(urls.join('\n'));
    expect(fs.readFileSync(filePath, 'utf8')).toBe(`${urls.join('\n')}\n`);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Successfully saved 2 URLs'),
    );

    consoleSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('logs error when writing URLs fails', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    handleUrlListing(
      ['https://a.example/1'],
      '/missing/dir/file.txt',
      mockLogger,
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to write URLs'),
    );

    consoleSpy.mockRestore();
  });
});
