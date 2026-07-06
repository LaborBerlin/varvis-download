const fs = require('node:fs');
const { resumeArchivedDownloads } = require('../../js/commands/resume.cjs');
const { getDownloadLinks, metrics } = require('../../js/fetchUtils.cjs');
const { readRestorationState } = require('../../js/restorationState.cjs');
const {
  ensureIndexFile,
  rangedDownloadBAM,
  rangedDownloadVCF,
  unmappedDownloadBAM,
} = require('../../js/rangedUtils.cjs');
const { isUrlExpiringSoon } = require('../../js/urlUtils.cjs');
const { getValidDownloadUrl } = require('../../js/download/urlRefresh.cjs');

jest.mock('node:fs');
jest.mock('../../js/fetchUtils.cjs', () => ({
  getDownloadLinks: jest.fn(),
  metrics: {
    startTime: 0,
    totalFilesDownloaded: 0,
    totalFilesSkipped: 0,
    totalBytesDownloaded: 0,
    downloadSpeeds: [],
  },
}));
jest.mock('../../js/restorationState.cjs', () => ({
  appendToAwaitingRestoration: jest.fn(),
  readRestorationState: jest.fn(),
  writeRestorationState: jest.fn(),
}));
jest.mock('../../js/rangedUtils.cjs', () => ({
  ensureIndexFile: jest.fn(),
  generateOutputFileName: jest.fn((fileName) => `out-${fileName}`),
  indexBAM: jest.fn(),
  indexVCF: jest.fn(),
  rangedDownloadBAM: jest.fn(),
  rangedDownloadVCF: jest.fn(),
  unmappedDownloadBAM: jest.fn(),
}));
jest.mock('../../js/fileUtils.cjs', () => ({
  downloadFile: jest.fn(),
}));
jest.mock('../../js/urlUtils.cjs', () => ({
  isUrlExpiringSoon: jest.fn(),
}));
jest.mock('../../js/download/urlRefresh.cjs', () => ({
  getValidDownloadUrl: jest.fn(),
}));

describe('archiveUtils.resumeArchivedDownloads ranged restores', () => {
  const mockAgent = {};
  const mockLogger = {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    // Default: no URL is treated as expiring, and any refresh lookup passes
    // the original downloadLink straight through. Individual tests override
    // these to exercise the refresh path.
    isUrlExpiringSoon.mockReturnValue(false);
    getValidDownloadUrl.mockImplementation(
      async (fileDict, fileName) => fileDict[fileName]?.downloadLink,
    );
  });

  test('passes metrics and overwrite to restored ranged BAM downloads', async () => {
    readRestorationState.mockReturnValue([
      {
        analysisId: 'A1',
        fileName: 'sample.bam',
        restoreEstimation: new Date(Date.now() - 60_000).toISOString(),
        options: {
          destination: '/restored',
          overwrite: true,
          range: 'chr1:10-20',
        },
      },
    ]);
    getDownloadLinks.mockResolvedValue({
      'sample.bam': {
        currentlyArchived: false,
        downloadLink: 'https://example.test/sample.bam',
        fileName: 'sample.bam',
      },
      'sample.bam.bai': {
        currentlyArchived: false,
        downloadLink: 'https://example.test/sample.bam.bai',
        fileName: 'sample.bam.bai',
      },
    });

    await resumeArchivedDownloads(
      'awaiting.json',
      '/fallback',
      'target',
      'token',
      mockAgent,
      mockLogger,
      false,
    );

    expect(ensureIndexFile).toHaveBeenCalledWith(
      'https://example.test/sample.bam',
      'https://example.test/sample.bam.bai',
      '/restored/sample.bam.bai',
      mockAgent,
      null,
      mockLogger,
      metrics,
      true,
    );
    expect(rangedDownloadBAM).toHaveBeenCalledWith(
      'https://example.test/sample.bam',
      expect.stringContaining('restore-regions-'),
      '/restored/out-sample.bam',
      '/restored/sample.bam.bai',
      mockLogger,
      metrics,
      true,
      false,
      ['chr1:10-20'],
    );
  });

  test('refreshes an expiring index URL for a resumed ranged BAM download', async () => {
    readRestorationState.mockReturnValue([
      {
        analysisId: 'A1',
        fileName: 'sample.bam',
        restoreEstimation: new Date(Date.now() - 60_000).toISOString(),
        options: {
          destination: '/restored',
          overwrite: true,
          range: 'chr1:10-20',
        },
      },
    ]);
    getDownloadLinks.mockResolvedValue({
      'sample.bam': {
        currentlyArchived: false,
        downloadLink: 'https://example.test/sample.bam',
        fileName: 'sample.bam',
      },
      'sample.bam.bai': {
        currentlyArchived: false,
        downloadLink: 'https://example.test/sample.bam.bai',
        fileName: 'sample.bam.bai',
      },
    });

    // Only the index URL is "expiring soon"; refreshing it yields a new URL.
    isUrlExpiringSoon.mockImplementation(
      (url) => url === 'https://example.test/sample.bam.bai',
    );
    getValidDownloadUrl.mockImplementation(async (fileDict, fileName) =>
      fileName === 'sample.bam.bai'
        ? 'https://example.test/refreshed.bam.bai'
        : fileDict[fileName]?.downloadLink,
    );

    await resumeArchivedDownloads(
      'awaiting.json',
      '/fallback',
      'target',
      'token',
      mockAgent,
      mockLogger,
      false,
    );

    expect(getValidDownloadUrl).toHaveBeenCalledWith(
      expect.any(Object),
      'sample.bam.bai',
      'target',
      'token',
      mockAgent,
      mockLogger,
    );
    expect(ensureIndexFile).toHaveBeenCalledWith(
      'https://example.test/sample.bam',
      'https://example.test/refreshed.bam.bai',
      '/restored/sample.bam.bai',
      mockAgent,
      null,
      mockLogger,
      metrics,
      true,
    );
    expect(rangedDownloadBAM).toHaveBeenCalledWith(
      'https://example.test/sample.bam',
      expect.stringContaining('restore-regions-'),
      '/restored/out-sample.bam',
      '/restored/sample.bam.bai',
      mockLogger,
      metrics,
      true,
      false,
      ['chr1:10-20'],
    );
  });

  test('preserves restored unmapped option for ranged BAM downloads', async () => {
    readRestorationState.mockReturnValue([
      {
        analysisId: 'A1',
        fileName: 'sample.bam',
        restoreEstimation: new Date(Date.now() - 60_000).toISOString(),
        options: {
          destination: '/restored',
          overwrite: true,
          range: 'chr1:10-20 chr2:30-40',
          unmapped: true,
        },
      },
    ]);
    getDownloadLinks.mockResolvedValue({
      'sample.bam': {
        currentlyArchived: false,
        downloadLink: 'https://example.test/sample.bam',
        fileName: 'sample.bam',
      },
      'sample.bam.bai': {
        currentlyArchived: false,
        downloadLink: 'https://example.test/sample.bam.bai',
        fileName: 'sample.bam.bai',
      },
    });

    await resumeArchivedDownloads(
      'awaiting.json',
      '/fallback',
      'target',
      'token',
      mockAgent,
      mockLogger,
      false,
    );

    expect(rangedDownloadBAM).toHaveBeenCalledWith(
      'https://example.test/sample.bam',
      expect.stringContaining('restore-regions-'),
      '/restored/out-sample.bam',
      '/restored/sample.bam.bai',
      mockLogger,
      metrics,
      true,
      true,
      ['chr1:10-20', 'chr2:30-40'],
    );
  });

  test('preserves restored unmapped-only BAM extraction', async () => {
    readRestorationState.mockReturnValue([
      {
        analysisId: 'A1',
        fileName: 'sample.bam',
        restoreEstimation: new Date(Date.now() - 60_000).toISOString(),
        options: {
          destination: '/restored',
          overwrite: true,
          unmapped: true,
        },
      },
    ]);
    getDownloadLinks.mockResolvedValue({
      'sample.bam': {
        currentlyArchived: false,
        downloadLink: 'https://example.test/sample.bam',
        fileName: 'sample.bam',
      },
      'sample.bam.bai': {
        currentlyArchived: false,
        downloadLink: 'https://example.test/sample.bam.bai',
        fileName: 'sample.bam.bai',
      },
    });

    await resumeArchivedDownloads(
      'awaiting.json',
      '/fallback',
      'target',
      'token',
      mockAgent,
      mockLogger,
      false,
    );

    expect(ensureIndexFile).toHaveBeenCalledWith(
      'https://example.test/sample.bam',
      'https://example.test/sample.bam.bai',
      '/restored/sample.bam.bai',
      mockAgent,
      null,
      mockLogger,
      metrics,
      true,
    );
    expect(unmappedDownloadBAM).toHaveBeenCalledWith(
      'https://example.test/sample.bam',
      '/restored/out-sample.bam',
      '/restored/sample.bam.bai',
      mockLogger,
      metrics,
      true,
    );
  });

  test('passes index path, metrics, and overwrite to restored ranged VCF downloads', async () => {
    readRestorationState.mockReturnValue([
      {
        analysisId: 'A1',
        fileName: 'sample.vcf.gz',
        restoreEstimation: new Date(Date.now() - 60_000).toISOString(),
        options: {
          destination: '/restored',
          overwrite: true,
          range: 'chr1:10-20',
        },
      },
    ]);
    getDownloadLinks.mockResolvedValue({
      'sample.vcf.gz': {
        currentlyArchived: false,
        downloadLink: 'https://example.test/sample.vcf.gz',
        fileName: 'sample.vcf.gz',
      },
      'sample.vcf.gz.tbi': {
        currentlyArchived: false,
        downloadLink: 'https://example.test/sample.vcf.gz.tbi',
        fileName: 'sample.vcf.gz.tbi',
      },
    });

    await resumeArchivedDownloads(
      'awaiting.json',
      '/fallback',
      'target',
      'token',
      mockAgent,
      mockLogger,
      false,
    );

    expect(ensureIndexFile).toHaveBeenCalledWith(
      'https://example.test/sample.vcf.gz',
      'https://example.test/sample.vcf.gz.tbi',
      '/restored/sample.vcf.gz.tbi',
      mockAgent,
      null,
      mockLogger,
      metrics,
      true,
    );
    expect(rangedDownloadVCF).toHaveBeenCalledWith(
      'https://example.test/sample.vcf.gz',
      'chr1:10-20',
      '/restored/out-sample.vcf.gz',
      '/restored/sample.vcf.gz.tbi',
      mockLogger,
      metrics,
      true,
    );
  });
});
