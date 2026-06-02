jest.mock('../../../js/urlUtils.cjs', () => ({
  formatRemainingTime: jest.fn(() => '2m'),
  getUrlRemainingTime: jest.fn(() => 120),
  isUrlExpiringSoon: jest.fn(),
}));

jest.mock('../../../js/fetchUtils.cjs', () => ({
  refreshDownloadUrls: jest.fn(),
}));

const { getValidDownloadUrl } = require('../../../js/download/urlRefresh.cjs');
const { refreshDownloadUrls } = require('../../../js/fetchUtils.cjs');
const { isUrlExpiringSoon } = require('../../../js/urlUtils.cjs');

describe('download/urlRefresh.getValidDownloadUrl', () => {
  const mockLogger = {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    isUrlExpiringSoon.mockReturnValue(false);
  });

  test('returns existing URL when it is not expiring', async () => {
    const fileDict = {
      'a.bam': { downloadLink: 'https://valid', analysisId: 'A1' },
    };

    const url = await getValidDownloadUrl(
      fileDict,
      'a.bam',
      'demo',
      'tok',
      {},
      mockLogger,
    );

    expect(url).toBe('https://valid');
    expect(refreshDownloadUrls).not.toHaveBeenCalled();
  });

  test('throws when the file has no download link', async () => {
    await expect(
      getValidDownloadUrl({}, 'missing.bam', 'demo', 'tok', {}, mockLogger),
    ).rejects.toThrow('No download link found for file: missing.bam');
  });

  test('returns stale URL when expiring file has no analysis ID', async () => {
    isUrlExpiringSoon.mockReturnValue(true);
    const fileDict = {
      'a.bam': { downloadLink: 'https://stale' },
    };

    const url = await getValidDownloadUrl(
      fileDict,
      'a.bam',
      'demo',
      'tok',
      {},
      mockLogger,
    );

    expect(url).toBe('https://stale');
    expect(refreshDownloadUrls).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No analysisId found'),
    );
  });

  test('refreshes expiring URL and updates the original file dictionary', async () => {
    isUrlExpiringSoon.mockReturnValue(true);
    refreshDownloadUrls.mockResolvedValue({
      'a.bam': { downloadLink: 'https://fresh' },
      'a.bam.bai': { downloadLink: 'https://fresh-index' },
    });
    const fileDict = {
      'a.bam': { downloadLink: 'https://stale', analysisId: 'A1' },
      'a.bam.bai': { downloadLink: 'https://stale-index', analysisId: 'A1' },
    };

    const url = await getValidDownloadUrl(
      fileDict,
      'a.bam',
      'demo',
      'tok',
      {},
      mockLogger,
    );

    expect(url).toBe('https://fresh');
    expect(fileDict['a.bam'].downloadLink).toBe('https://fresh');
    expect(fileDict['a.bam.bai'].downloadLink).toBe('https://fresh-index');
    expect(refreshDownloadUrls).toHaveBeenCalledWith(
      'A1',
      'demo',
      'tok',
      {},
      mockLogger,
    );
  });

  test('uses original URL when refreshed response omits the requested file', async () => {
    isUrlExpiringSoon.mockReturnValue(true);
    refreshDownloadUrls.mockResolvedValue({});
    const fileDict = {
      'a.bam': { downloadLink: 'https://stale', analysisId: 'A1' },
    };

    const url = await getValidDownloadUrl(
      fileDict,
      'a.bam',
      'demo',
      'tok',
      {},
      mockLogger,
    );

    expect(url).toBe('https://stale');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not find refreshed URL'),
    );
  });
});
