jest.mock('../../../js/download/urlRefresh.cjs', () => ({
  getValidDownloadUrl: jest.fn(async (_fileDict, name) => `https://${name}`),
}));

jest.mock('../../../js/urlUtils.cjs', () => ({
  isUrlExpiringSoon: jest.fn(() => false),
}));

jest.mock('../../../js/rangedUtils.cjs', () => ({
  ensureIndexFile: jest.fn(),
  generateOutputFileName: jest.fn((name, regions) =>
    regions?.length ? `out_${name}_${regions.join('_')}` : `out_${name}`,
  ),
  indexBAM: jest.fn(),
  rangedDownloadBAM: jest.fn(),
  unmappedDownloadBAM: jest.fn(),
}));

jest.mock('../../../js/download/commonDownload.cjs', () => ({
  fullDownloadWithOptionalIndex: jest.fn(),
}));

const { handleBamFile } = require('../../../js/download/bamHandler.cjs');
const {
  ensureIndexFile,
  indexBAM,
  rangedDownloadBAM,
} = require('../../../js/rangedUtils.cjs');
const {
  fullDownloadWithOptionalIndex,
} = require('../../../js/download/commonDownload.cjs');

describe('download/bamHandler.handleBamFile', () => {
  const mockLogger = {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };
  const deps = {
    agent: {},
    authService: { token: 'tok' },
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
  const baseFileDict = {
    'sample.bam': { analysisId: 'A1', downloadLink: 'https://primary' },
    'sample.bam.bai': { analysisId: 'A1', downloadLink: 'https://index' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('ranged download ensures index, runs rangedDownloadBAM, and indexes output', async () => {
    await handleBamFile(
      {
        fileDict: { ...baseFileDict },
        fileName: 'sample.bam',
        finalConfig: {
          destination: '/tmp',
          overwrite: false,
          unmapped: false,
        },
        regions: ['chr1:1-100'],
        target: 'demo',
        tempBedPath: '/tmp/regions.bed',
      },
      deps,
    );

    expect(ensureIndexFile).toHaveBeenCalled();
    expect(rangedDownloadBAM).toHaveBeenCalled();
    expect(indexBAM).toHaveBeenCalled();
    expect(fullDownloadWithOptionalIndex).not.toHaveBeenCalled();
  });

  test('full download delegates primary and optional index to common helper', async () => {
    await handleBamFile(
      {
        fileDict: { ...baseFileDict },
        fileName: 'sample.bam',
        finalConfig: {
          destination: '/tmp',
          overwrite: true,
          unmapped: false,
        },
        regions: [],
        target: 'demo',
      },
      deps,
    );

    expect(fullDownloadWithOptionalIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        index: expect.objectContaining({ label: 'sample.bam.bai' }),
        overwrite: true,
        primary: expect.objectContaining({ url: 'https://sample.bam' }),
      }),
      deps,
    );
    expect(rangedDownloadBAM).not.toHaveBeenCalled();
  });

  test('logs and skips ranged download when required index is missing', async () => {
    await handleBamFile(
      {
        fileDict: {
          'sample.bam': {
            analysisId: 'A1',
            downloadLink: 'https://primary',
          },
        },
        fileName: 'sample.bam',
        finalConfig: {
          destination: '/tmp',
          overwrite: false,
          unmapped: true,
        },
        regions: [],
        target: 'demo',
      },
      deps,
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Index file for BAM'),
    );
    expect(ensureIndexFile).not.toHaveBeenCalled();
  });
});
