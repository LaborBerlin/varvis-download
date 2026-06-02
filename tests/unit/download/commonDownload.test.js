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

  test('downloads the primary file when no index URL is provided', async () => {
    await fullDownloadWithOptionalIndex(
      {
        index: null,
        overwrite: false,
        primary: { path: '/tmp/file.bam', url: 'https://primary' },
      },
      deps,
    );

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

  test('downloads the primary file and then the optional index', async () => {
    await fullDownloadWithOptionalIndex(
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

    expect(downloadFile).toHaveBeenCalledTimes(2);
    expect(downloadFile.mock.calls[1]).toEqual([
      'https://index',
      '/tmp/file.bam.bai',
      true,
      deps.agent,
      deps.rl,
      deps.logger,
      deps.metrics,
    ]);
  });

  test('logs warning when optional index download fails', async () => {
    downloadFile
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('index 404'));

    await fullDownloadWithOptionalIndex(
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

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to download index file file.bam.bai'),
    );
  });
});
