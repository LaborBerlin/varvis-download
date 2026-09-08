jest.mock('../../../js/fileUtils.cjs', () => ({
  downloadFile: jest.fn(),
}));

const {
  fullDownloadWithOptionalIndex,
} = require('../../../js/download/commonDownload.cjs');
const { downloadFile } = require('../../../js/fileUtils.cjs');

describe('download/commonDownload.fullDownloadWithOptionalIndex', () => {
  const mockLogger = {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };
  const deps = {
    agent: {},
    logger: mockLogger,
    metrics: {
      downloadSpeeds: [],
      startTime: 0,
      totalBytesDownloaded: 0,
      totalFilesDownloaded: 0,
      totalFilesSkipped: 0,
    },
    rl: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns { indexDownloaded: false } when no index is provided', async () => {
    const result = await fullDownloadWithOptionalIndex(
      {
        index: null,
        overwrite: false,
        primary: { path: '/tmp/file.bam', url: 'https://primary' },
      },
      deps,
    );

    expect(result).toEqual({ indexDownloaded: false });
    expect(downloadFile).toHaveBeenCalledTimes(1);
    expect(downloadFile).toHaveBeenCalledWith(
      'https://primary',
      '/tmp/file.bam',
      false,
      deps.agent,
      deps.rl,
      deps.logger,
      deps.metrics,
    );
  });

  test('downloads the index file first before the primary file and returns { indexDownloaded: true }', async () => {
    const result = await fullDownloadWithOptionalIndex(
      {
        index: {
          label: 'file.bam.bai',
          path: '/tmp/file.bam.bai',
          url: 'https://index',
        },
        overwrite: true,
        primary: { path: '/tmp/file.bam', url: 'https://primary' },
      },
      deps,
    );

    expect(result).toEqual({ indexDownloaded: true });
    expect(downloadFile).toHaveBeenCalledTimes(2);
    expect(downloadFile.mock.calls[0]).toEqual([
      'https://index',
      '/tmp/file.bam.bai',
      true,
      deps.agent,
      deps.rl,
      deps.logger,
      deps.metrics,
    ]);
    expect(downloadFile.mock.calls[1]).toEqual([
      'https://primary',
      '/tmp/file.bam',
      true,
      deps.agent,
      deps.rl,
      deps.logger,
      deps.metrics,
    ]);
  });

  test('attempts primary download and returns { indexDownloaded: false } when index download fails', async () => {
    downloadFile
      .mockRejectedValueOnce(new Error('index 404'))
      .mockResolvedValueOnce();

    const result = await fullDownloadWithOptionalIndex(
      {
        index: {
          label: 'file.bam.bai',
          path: '/tmp/file.bam.bai',
          url: 'https://index',
        },
        overwrite: false,
        primary: { path: '/tmp/file.bam', url: 'https://primary' },
      },
      deps,
    );

    expect(result).toEqual({ indexDownloaded: false });
    expect(downloadFile).toHaveBeenCalledTimes(2);
    expect(downloadFile.mock.calls[0][0]).toBe('https://index');
    expect(downloadFile.mock.calls[1][0]).toBe('https://primary');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to download index file file.bam.bai'),
    );
  });
});
