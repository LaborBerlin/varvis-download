jest.mock('../../../js/fetchUtils.cjs', () => ({
  getDownloadLinks: jest.fn(),
  metrics: {
    downloadSpeeds: [],
    startTime: 0,
    totalBytesDownloaded: 0,
    totalFilesDownloaded: 0,
    totalFilesSkipped: 0,
  },
}));

jest.mock('../../../js/restorationState.cjs', () => ({
  readRestorationState: jest.fn(),
  writeRestorationState: jest.fn(),
}));

jest.mock('../../../js/rangedUtils.cjs', () => ({
  ensureIndexFile: jest.fn(),
  generateOutputFileName: jest.fn(),
  indexBAM: jest.fn(),
  indexVCF: jest.fn(),
  rangedDownloadBAM: jest.fn(),
  rangedDownloadVCF: jest.fn(),
}));

jest.mock('../../../js/fileUtils.cjs', () => ({
  downloadFile: jest.fn(),
}));

const { resumeArchivedDownloads } = require('../../../js/commands/resume.cjs');
const {
  readRestorationState,
  writeRestorationState,
} = require('../../../js/restorationState.cjs');

describe('commands/resume.resumeArchivedDownloads', () => {
  const mockLogger = {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('logs and returns when restoration state is empty', async () => {
    readRestorationState.mockReturnValue(null);

    await resumeArchivedDownloads(
      'awaiting-restoration.json',
      '/tmp',
      'demo',
      'tok',
      {},
      mockLogger,
      false,
    );

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Nothing to resume'),
    );
  });

  test('skips entries whose restore estimation has not passed', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    readRestorationState.mockReturnValue([
      { fileName: 'a.bam', restoreEstimation: future },
    ]);

    await resumeArchivedDownloads(
      'awaiting-restoration.json',
      '/tmp',
      'demo',
      'tok',
      {},
      mockLogger,
      false,
    );

    expect(writeRestorationState).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ fileName: 'a.bam' })]),
      'awaiting-restoration.json',
      mockLogger,
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('1 entries remaining'),
    );
  });
});
