jest.mock('../../../js/download/atomicOutput.cjs', () => ({
  withStagedOutput: jest.fn(async (file, _overwrite, _suffix, action) =>
    action(file),
  ),
}));
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

  test('processes entries with missing or null restore estimation as ready (#153)', async () => {
    const entry = {
      analysisId: 'A1',
      fileName: 'sample.bam',
      restoreEstimation: null,
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

    expect(handleBamFile).toHaveBeenCalled();
    const writtenData = writeRestorationState.mock.calls[0][0];
    expect(writtenData).toHaveLength(0);
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
  test.each([
    [{}, {}, true, 2097152],
    [
      { boundedRangeProxy: false, boundedRangeChunkSize: 65536 },
      {},
      false,
      65536,
    ],
    [
      { boundedRangeProxy: true },
      { boundedRangeProxy: false, boundedRangeProxyExplicit: true },
      false,
      2097152,
    ],
    [
      { boundedRangeChunkSize: 65536 },
      { boundedRangeChunkSize: 4194304, boundedRangeChunkSizeExplicit: true },
      true,
      4194304,
    ],
    [
      { boundedRangeProxy: false, boundedRangeChunkSize: 65536 },
      { boundedRangeProxy: true, boundedRangeChunkSize: 2097152 },
      false,
      65536,
    ],
  ])(
    'restores proxy settings with explicit current options taking precedence',
    async (saved, current, enabled, chunkSize) => {
      readRestorationState.mockReturnValue([
        {
          analysisId: 'A1',
          fileName: 'sample.bam',
          restoreEstimation: new Date(0).toISOString(),
          options: saved,
        },
      ]);
      getDownloadLinks.mockResolvedValue({
        'sample.bam': { downloadLink: 'https://example.test/sample.bam' },
      });
      handleBamFile.mockResolvedValue({ ok: true });
      await resumeArchivedDownloads(
        'state.json',
        '/tmp',
        'demo',
        'tok',
        {},
        mockLogger,
        false,
        current,
      );
      expect(handleBamFile).toHaveBeenCalledWith(
        expect.objectContaining({
          finalConfig: expect.objectContaining({
            boundedRangeProxy: enabled,
            boundedRangeChunkSize: chunkSize,
          }),
        }),
        expect.anything(),
      );
    },
  );

  test('returns failed count after preserving failed restoration entries', async () => {
    const entry = {
      analysisId: 'A1',
      fileName: 'sample.bam',
      restoreEstimation: new Date(0).toISOString(),
    };
    readRestorationState.mockReturnValue([entry]);
    getDownloadLinks.mockResolvedValue({
      'sample.bam': { downloadLink: 'https://example.test/sample.bam' },
    });
    handleBamFile.mockResolvedValue({ ok: false });
    expect(
      await resumeArchivedDownloads(
        'state.json',
        '/tmp',
        'demo',
        'tok',
        {},
        mockLogger,
        false,
      ),
    ).toBe(1);
    expect(writeRestorationState).toHaveBeenCalledWith(
      [entry],
      'state.json',
      mockLogger,
    );
  });
  test.each(['sample.bam', 'sample.vcf.gz'])(
    'counts a ready %s missing its required index as failed',
    async (fileName) => {
      const entry = {
        analysisId: 'A1',
        fileName,
        restoreEstimation: new Date(0).toISOString(),
        options: { range: '1:1-9' },
      };
      readRestorationState.mockReturnValue([entry]);
      getDownloadLinks.mockResolvedValue({
        [fileName]: { downloadLink: `https://example.test/${fileName}` },
      });
      const failed = await resumeArchivedDownloads(
        'state.json',
        '/tmp',
        'demo',
        'tok',
        {},
        mockLogger,
        false,
      );
      expect(failed).toBe(1);
      expect(writeRestorationState).toHaveBeenCalledWith(
        [entry],
        'state.json',
        mockLogger,
      );
      expect(handleBamFile).not.toHaveBeenCalled();
      expect(handleVcfFile).not.toHaveBeenCalled();
    },
  );

  test('does not count a still archived file as a download failure', async () => {
    const entry = {
      analysisId: 'A1',
      fileName: 'sample.bam',
      restoreEstimation: new Date(0).toISOString(),
    };
    readRestorationState.mockReturnValue([entry]);
    getDownloadLinks.mockResolvedValue({
      'sample.bam': { currentlyArchived: true },
    });
    const failed = await resumeArchivedDownloads(
      'state.json',
      '/tmp',
      'demo',
      'tok',
      {},
      mockLogger,
      false,
    );
    expect(failed).toBe(0);
    expect(writeRestorationState).toHaveBeenCalledWith(
      [entry],
      'state.json',
      mockLogger,
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
