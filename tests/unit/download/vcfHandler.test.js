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
  indexVCF: jest.fn(),
  rangedDownloadVCF: jest.fn(),
}));

jest.mock('../../../js/download/commonDownload.cjs', () => ({
  fullDownloadWithOptionalIndex: jest.fn(),
}));

const { handleVcfFile } = require('../../../js/download/vcfHandler.cjs');
const {
  ensureIndexFile,
  indexVCF,
  rangedDownloadVCF,
} = require('../../../js/rangedUtils.cjs');
const {
  fullDownloadWithOptionalIndex,
} = require('../../../js/download/commonDownload.cjs');

describe('download/vcfHandler.handleVcfFile', () => {
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
    'sample.vcf.gz': { analysisId: 'A1', downloadLink: 'https://primary' },
    'sample.vcf.gz.tbi': {
      analysisId: 'A1',
      downloadLink: 'https://index',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('ranged download ensures index and runs once per region', async () => {
    await handleVcfFile(
      {
        fileDict: { ...baseFileDict },
        fileName: 'sample.vcf.gz',
        finalConfig: { destination: '/tmp', overwrite: false },
        regions: ['chr1:1-10', 'chr2:5-15'],
        target: 'demo',
      },
      deps,
    );

    expect(ensureIndexFile).toHaveBeenCalledTimes(1);
    expect(rangedDownloadVCF).toHaveBeenCalledTimes(2);
    expect(indexVCF).toHaveBeenCalledTimes(2);
    expect(fullDownloadWithOptionalIndex).not.toHaveBeenCalled();
  });

  test('full download delegates primary and optional index to common helper', async () => {
    await handleVcfFile(
      {
        fileDict: { ...baseFileDict },
        fileName: 'sample.vcf.gz',
        finalConfig: { destination: '/tmp', overwrite: true },
        regions: [],
        target: 'demo',
      },
      deps,
    );

    expect(fullDownloadWithOptionalIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        index: expect.objectContaining({ label: 'sample.vcf.gz.tbi' }),
        overwrite: true,
        primary: expect.objectContaining({ url: 'https://sample.vcf.gz' }),
      }),
      deps,
    );
    expect(rangedDownloadVCF).not.toHaveBeenCalled();
  });

  test('logs and skips ranged download when required index is missing', async () => {
    await handleVcfFile(
      {
        fileDict: {
          'sample.vcf.gz': {
            analysisId: 'A1',
            downloadLink: 'https://primary',
          },
        },
        fileName: 'sample.vcf.gz',
        finalConfig: { destination: '/tmp', overwrite: false },
        regions: ['chr1:1-10'],
        target: 'demo',
      },
      deps,
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Index file for VCF'),
    );
    expect(ensureIndexFile).not.toHaveBeenCalled();
  });

  test('logs and skips VCF files when unmapped extraction is requested', async () => {
    await handleVcfFile(
      {
        fileDict: { ...baseFileDict },
        fileName: 'sample.vcf.gz',
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

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('unmapped read extraction only applies to BAM'),
    );
    expect(fullDownloadWithOptionalIndex).not.toHaveBeenCalled();
    expect(rangedDownloadVCF).not.toHaveBeenCalled();
  });
});
