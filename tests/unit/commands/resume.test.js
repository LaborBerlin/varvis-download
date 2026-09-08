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
  generateOutputFileName: jest.fn((fileName) => fileName),
}));

jest.mock('../../../js/fileUtils.cjs', () => ({
  downloadFile: jest.fn(),
}));

jest.mock('../../../js/download/bamHandler.cjs', () => ({
  handleBamFile: jest.fn(),
}));

jest.mock('../../../js/download/vcfHandler.cjs', () => ({
  handleVcfFile: jest.fn(),
}));

const fs = require('node:fs');
const { resumeArchivedDownloads } = require('../../../js/commands/resume.cjs');
const {
  readRestorationState,
  writeRestorationState,
} = require('../../../js/restorationState.cjs');
const { getDownloadLinks } = require('../../../js/fetchUtils.cjs');
const { downloadFile } = require('../../../js/fileUtils.cjs');
const { handleBamFile } = require('../../../js/download/bamHandler.cjs');
const { handleVcfFile } = require('../../../js/download/vcfHandler.cjs');

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

  test('requeues the entry when handleBamFile resolves { ok: false }', async () => {
    const entry = {
      analysisId: 'A1',
      fileName: 'sample.bam',
      restoreEstimation: new Date(Date.now() - 60_000).toISOString(),
      options: { destination: '/tmp', overwrite: false },
    };
    readRestorationState.mockReturnValue([entry]);
    getDownloadLinks.mockResolvedValue({
      'sample.bam': {
        currentlyArchived: false,
        downloadLink: 'https://example.test/sample.bam',
      },
    });
    handleBamFile.mockResolvedValueOnce({ ok: false });

    await resumeArchivedDownloads(
      'awaiting-restoration.json',
      '/tmp',
      'demo',
      'tok',
      {},
      mockLogger,
      false,
    );

    expect(handleBamFile).toHaveBeenCalled();
    expect(writeRestorationState).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ fileName: 'sample.bam' }),
      ]),
      'awaiting-restoration.json',
      mockLogger,
    );
  });

  test('drops the entry when handleBamFile resolves { ok: true }', async () => {
    const entry = {
      analysisId: 'A1',
      fileName: 'sample.bam',
      restoreEstimation: new Date(Date.now() - 60_000).toISOString(),
      options: { destination: '/tmp', overwrite: false },
    };
    readRestorationState.mockReturnValue([entry]);
    getDownloadLinks.mockResolvedValue({
      'sample.bam': {
        currentlyArchived: false,
        downloadLink: 'https://example.test/sample.bam',
      },
    });
    handleBamFile.mockResolvedValueOnce({ ok: true });

    await resumeArchivedDownloads(
      'awaiting-restoration.json',
      '/tmp',
      'demo',
      'tok',
      {},
      mockLogger,
      false,
    );

    const writtenData = writeRestorationState.mock.calls[0][0];
    expect(writtenData).toHaveLength(0);
  });

  test('forces unmapped:false when delegating a VCF even if restored options persisted unmapped:true', async () => {
    const entry = {
      analysisId: 'A1',
      fileName: 'sample.vcf.gz',
      restoreEstimation: new Date(Date.now() - 60_000).toISOString(),
      options: { destination: '/tmp', overwrite: false, unmapped: true },
    };
    readRestorationState.mockReturnValue([entry]);
    getDownloadLinks.mockResolvedValue({
      'sample.vcf.gz': {
        currentlyArchived: false,
        downloadLink: 'https://example.test/sample.vcf.gz',
      },
    });
    handleVcfFile.mockResolvedValueOnce({ ok: true });

    await resumeArchivedDownloads(
      'awaiting-restoration.json',
      '/tmp',
      'demo',
      'tok',
      {},
      mockLogger,
      false,
    );

    expect(handleVcfFile).toHaveBeenCalledWith(
      expect.objectContaining({
        finalConfig: expect.objectContaining({ unmapped: false }),
      }),
      expect.anything(),
    );
  });

  test('requeues entry and prevents download when BED file cannot be read', async () => {
    const entry = {
      analysisId: 'A1',
      fileName: 'sample.bam',
      restoreEstimation: new Date(Date.now() - 60_000).toISOString(),
      options: { destination: '/tmp', overwrite: false, bed: '/missing.bed' },
    };
    readRestorationState.mockReturnValue([entry]);
    getDownloadLinks.mockResolvedValue({
      'sample.bam': {
        currentlyArchived: false,
        downloadLink: 'https://example.test/sample.bam',
      },
    });
    const readSpy = jest
      .spyOn(fs, 'readFileSync')
      .mockImplementationOnce(() => {
        throw new Error('ENOENT: no such file or directory');
      });

    try {
      await resumeArchivedDownloads(
        'awaiting-restoration.json',
        '/tmp',
        'demo',
        'tok',
        {},
        mockLogger,
        false,
      );

      expect(handleBamFile).not.toHaveBeenCalled();
      expect(handleVcfFile).not.toHaveBeenCalled();
      expect(downloadFile).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringMatching(
          /Error reading BED file.*Keeping entry in restoration queue to prevent unintended full download/,
        ),
      );
      expect(writeRestorationState).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ fileName: 'sample.bam' }),
        ]),
        'awaiting-restoration.json',
        mockLogger,
      );
    } finally {
      readSpy.mockRestore();
    }
  });
});
