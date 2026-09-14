jest.mock('../../../js/fetchUtils.cjs', () => ({
  fetchAnalysisIds: jest.fn(async () => ['A1']),
  generateReport: jest.fn(),
  getDownloadLinks: jest.fn(async () => ({
    'sample.bam': { analysisId: 'A1', downloadLink: 'https://primary-bam' },
    'sample.vcf.gz': { analysisId: 'A1', downloadLink: 'https://primary-vcf' },
  })),
  metrics: {
    downloadSpeeds: [],
    startTime: 0,
    totalBytesDownloaded: 0,
    totalFilesDownloaded: 0,
    totalFilesSkipped: 0,
  },
}));

jest.mock('../../../js/download/bamHandler.cjs', () => ({
  handleBamFile: jest.fn(),
}));

jest.mock('../../../js/download/vcfHandler.cjs', () => ({
  handleVcfFile: jest.fn(),
}));

jest.mock('../../../js/io/urlListing.cjs', () => ({
  handleUrlListing: jest.fn(),
}));

jest.mock('../../../js/toolChecks.cjs', () => ({
  checkToolAvailability: jest.fn(async () => true),
}));

const { runDownloadCommand } = require('../../../js/commands/download.cjs');
const { handleBamFile } = require('../../../js/download/bamHandler.cjs');
const { handleVcfFile } = require('../../../js/download/vcfHandler.cjs');
const { checkToolAvailability } = require('../../../js/toolChecks.cjs');

describe('commands/download proxy guard', () => {
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

  // create base configuration helper for test scenarios
  const createConfig = (overrides = {}) => ({
    analysisIds: ['A1'],
    bed: null,
    boundedRangeChunkSize: 1048576,
    boundedRangeProxy: true,
    boundedRangeProxyExplicit: false,
    destination: '/tmp',
    filetypes: ['bam', 'vcf'],
    filters: [],
    latest: false,
    limsIds: [],
    listUrls: false,
    overwrite: false,
    range: 'chr1:1-100',
    restorationFile: 'awaiting-restoration.json',
    restoreArchived: 'ask',
    sampleIds: [],
    target: 'demo',
    unmapped: false,
    urlFile: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    checkToolAvailability.mockResolvedValue(true);
  });

  test.each([true, false])(
    'passes configured proxy=%s to both tools',
    async (enabled) => {
      const finalConfig = createConfig({ boundedRangeProxy: enabled });
      handleBamFile.mockResolvedValue({ ok: true });
      handleVcfFile.mockResolvedValue({ ok: true });
      await runDownloadCommand({ finalConfig, regions: ['chr1:1-100'] }, deps);
      for (const handler of [handleBamFile, handleVcfFile]) {
        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            finalConfig: expect.objectContaining({
              boundedRangeProxy: enabled,
            }),
          }),
          deps,
        );
      }
    },
  );

  test('reports a failed handler after processing the other files', async () => {
    handleBamFile.mockResolvedValue({ ok: false });
    handleVcfFile.mockResolvedValue({ ok: true });
    await expect(
      runDownloadCommand({ finalConfig: createConfig(), regions: [] }, deps),
    ).rejects.toMatchObject({ exitCode: 1 });
    expect(handleVcfFile).toHaveBeenCalled();
    expect(mockLogger.info).not.toHaveBeenCalledWith('Download complete.');
  });

  test('persists proxy settings when requesting restoration', async () => {
    handleBamFile.mockResolvedValue({ ok: true });
    handleVcfFile.mockResolvedValue({ ok: true });
    await runDownloadCommand(
      { finalConfig: createConfig({ boundedRangeProxy: false }), regions: [] },
      deps,
    );
    expect(
      require('../../../js/fetchUtils.cjs').getDownloadLinks,
    ).toHaveBeenCalledWith(
      'A1',
      expect.anything(),
      'demo',
      'tok',
      deps.agent,
      mockLogger,
      'ask',
      deps.rl,
      'awaiting-restoration.json',
      expect.objectContaining({
        boundedRangeProxy: false,
        boundedRangeChunkSize: 1048576,
      }),
    );
  });
});
