const fs = require('node:fs');
const path = require('node:path');
const { resumeArchivedDownloads } = require('../../../js/commands/resume.cjs');
const { getDownloadLinks, metrics } = require('../../../js/fetchUtils.cjs');
const {
  readRestorationState,
  writeRestorationState,
} = require('../../../js/restorationState.cjs');
const {
  ensureIndexFile,
  indexVCF,
  rangedDownloadBAM,
  rangedDownloadVCF,
  unmappedDownloadBAM,
} = require('../../../js/rangedUtils.cjs');
const { downloadFile } = require('../../../js/fileUtils.cjs');

jest.mock('node:fs');
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
// Use the REAL generateOutputFileName so filename assertions test real behaviour.
jest.mock('../../../js/rangedUtils.cjs', () => {
  const actual = jest.requireActual('../../../js/rangedUtils.cjs');
  return {
    ensureIndexFile: jest.fn(),
    generateOutputFileName: actual.generateOutputFileName,
    indexBAM: jest.fn(),
    indexVCF: jest.fn(),
    rangedDownloadBAM: jest.fn(),
    rangedDownloadVCF: jest.fn(),
    unmappedDownloadBAM: jest.fn(),
  };
});
jest.mock('../../../js/fileUtils.cjs', () => ({
  downloadFile: jest.fn(),
}));

describe('commands/resume ranged/region handling', () => {
  const mockAgent = {};
  const mockLogger = {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };

  const pastEstimation = () => new Date(Date.now() - 60_000).toISOString();

  const run = () =>
    resumeArchivedDownloads(
      'awaiting.json',
      '/fallback',
      'target',
      'token',
      mockAgent,
      mockLogger,
      false,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
  });

  test('downloads every region of a multi-region ranged VCF (not just the first)', async () => {
    readRestorationState.mockReturnValue([
      {
        analysisId: 'A1',
        fileName: 'sample.vcf.gz',
        restoreEstimation: pastEstimation(),
        options: {
          destination: '/restored',
          overwrite: true,
          range: 'chr1:10-20 chr2:30-40',
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

    await run();

    expect(rangedDownloadVCF).toHaveBeenCalledTimes(2);
    expect(rangedDownloadVCF).toHaveBeenCalledWith(
      'https://example.test/sample.vcf.gz',
      'chr1:10-20',
      path.join('/restored', 'sample.chr1_10_20.vcf.gz'),
      path.join('/restored', 'sample.vcf.gz.tbi'),
      mockLogger,
      metrics,
      true,
    );
    expect(rangedDownloadVCF).toHaveBeenCalledWith(
      'https://example.test/sample.vcf.gz',
      'chr2:30-40',
      path.join('/restored', 'sample.chr2_30_40.vcf.gz'),
      path.join('/restored', 'sample.vcf.gz.tbi'),
      mockLogger,
      metrics,
      true,
    );
    expect(indexVCF).toHaveBeenCalledTimes(2);
  });

  test('downloads the tbi index under the canonical name tabix expects', async () => {
    readRestorationState.mockReturnValue([
      {
        analysisId: 'A1',
        fileName: 'sample.vcf.gz',
        restoreEstimation: pastEstimation(),
        options: {
          destination: '/restored',
          overwrite: true,
          range: 'chr1:10-20 chr2:30-40',
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

    await run();

    expect(ensureIndexFile).toHaveBeenCalledWith(
      'https://example.test/sample.vcf.gz',
      'https://example.test/sample.vcf.gz.tbi',
      path.join('/restored', 'sample.vcf.gz.tbi'),
      mockAgent,
      null,
      mockLogger,
      metrics,
      true,
    );
  });

  test('handles a chromosome-only ranged BAM restore without crashing', async () => {
    readRestorationState.mockReturnValue([
      {
        analysisId: 'A1',
        fileName: 'sample.bam',
        restoreEstimation: pastEstimation(),
        options: {
          destination: '/restored',
          overwrite: true,
          range: 'chr1',
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

    await run();

    // The whole-chromosome region must reach samtools instead of throwing.
    expect(rangedDownloadBAM).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).not.toHaveBeenCalled();
    // The BED file written for samtools uses the whole-chromosome span.
    const bedWrite = fs.writeFileSync.mock.calls.find((call) =>
      String(call[0]).includes('restore-regions-'),
    );
    expect(bedWrite).toBeDefined();
    expect(bedWrite[1]).toBe('chr1\t1\t300000000');
    // Successful resume removes the entry.
    expect(writeRestorationState).toHaveBeenCalledWith(
      [],
      'awaiting.json',
      mockLogger,
    );
  });

  test('does not add a spurious .unmapped infix to a resumed VCF when global --unmapped was persisted', async () => {
    readRestorationState.mockReturnValue([
      {
        analysisId: 'A1',
        fileName: 'sample.vcf.gz',
        restoreEstimation: pastEstimation(),
        options: {
          destination: '/restored',
          overwrite: true,
          unmapped: true,
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

    await run();

    expect(downloadFile).toHaveBeenCalledWith(
      'https://example.test/sample.vcf.gz',
      path.join('/restored', 'sample.vcf.gz'),
      true,
      mockAgent,
      null,
      mockLogger,
      metrics,
    );
    const primaryDownload = downloadFile.mock.calls.find(
      (call) => call[0] === 'https://example.test/sample.vcf.gz',
    );
    expect(primaryDownload[1]).not.toContain('unmapped');
  });

  test('still writes unmapped-only BAM extraction under the .unmapped name', async () => {
    readRestorationState.mockReturnValue([
      {
        analysisId: 'A1',
        fileName: 'sample.bam',
        restoreEstimation: pastEstimation(),
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

    await run();

    expect(unmappedDownloadBAM).toHaveBeenCalledWith(
      'https://example.test/sample.bam',
      path.join('/restored', 'sample.unmapped.bam'),
      path.join('/restored', 'sample.bam.bai'),
      mockLogger,
      metrics,
      true,
    );
  });
});
