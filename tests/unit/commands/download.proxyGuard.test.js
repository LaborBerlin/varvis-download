jest.mock('../../../js/fetchUtils.cjs', () => ({
  fetchAnalysisIds: jest.fn(async () => ['A1']),
  generateReport: jest.fn(),
  getDownloadLinks: jest.fn(async () => ({
    'sample.bam': { analysisId: 'A1', downloadLink: 'https://primary' },
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
  getToolVersion: jest.fn(),
  isToolAffectedByUnboundedRangeBug: jest.requireActual(
    '../../../js/toolChecks.cjs',
  ).isToolAffectedByUnboundedRangeBug,
}));

const { runDownloadCommand } = require('../../../js/commands/download.cjs');
const {
  checkToolAvailability,
  getToolVersion,
} = require('../../../js/toolChecks.cjs');

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
    filetypes: ['bam'],
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

  // bypass proxy when samtools version is 1.25.0 or above and flag is not explicit
  test('bypasses proxy when samtools version >= 1.25.0 and proxy flag is not explicit', async () => {
    getToolVersion.mockImplementation(async (tool) => {
      if (tool === 'samtools') return '1.25.0';
      return '1.24';
    });

    const finalConfig = createConfig({
      boundedRangeProxy: true,
      boundedRangeProxyExplicit: false,
    });

    await runDownloadCommand({ finalConfig, regions: ['chr1:1-100'] }, deps);

    expect(finalConfig.boundedRangeProxy).toBe(false);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Detected samtools version 1.25.0 with native bounded range support; proxy bypassed.',
    );
  });

  // keep proxy enabled when samtools version is below 1.25.0
  test('keeps proxy enabled when samtools version is below 1.25.0', async () => {
    getToolVersion.mockImplementation(async (tool) => {
      if (tool === 'samtools') return '1.24.1';
      return '1.24';
    });

    const finalConfig = createConfig({
      boundedRangeProxy: true,
      boundedRangeProxyExplicit: false,
    });

    await runDownloadCommand({ finalConfig, regions: ['chr1:1-100'] }, deps);

    expect(finalConfig.boundedRangeProxy).toBe(true);
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('native bounded range support; proxy bypassed'),
    );
  });

  // keep proxy enabled when samtools >= 1.25.0 but proxy was explicitly requested
  test('retains proxy when samtools version >= 1.25.0 if proxy flag was explicitly passed', async () => {
    getToolVersion.mockImplementation(async (tool) => {
      if (tool === 'samtools') return '1.25.0';
      return '1.24';
    });

    const finalConfig = createConfig({
      boundedRangeProxy: true,
      boundedRangeProxyExplicit: true,
    });

    await runDownloadCommand({ finalConfig, regions: ['chr1:1-100'] }, deps);

    expect(finalConfig.boundedRangeProxy).toBe(true);
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('native bounded range support; proxy bypassed'),
    );
  });

  // bypass proxy when tabix version is 1.25.0 or above and flag is not explicit
  test('bypasses proxy when tabix version >= 1.25.0 and proxy flag is not explicit', async () => {
    getToolVersion.mockImplementation(async (tool) => {
      if (tool === 'samtools') return '1.24';
      if (tool === 'tabix') return '1.25.0';
      return '1.24';
    });

    const finalConfig = createConfig({
      boundedRangeProxy: true,
      boundedRangeProxyExplicit: false,
    });

    await runDownloadCommand({ finalConfig, regions: ['chr1:1-100'] }, deps);

    expect(finalConfig.boundedRangeProxy).toBe(false);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Detected tabix version 1.25.0 with native bounded range support; proxy bypassed.',
    );
  });

  // keep proxy enabled when tabix version >= 1.25.0 but proxy was explicitly requested
  test('retains proxy when tabix version >= 1.25.0 if proxy flag was explicitly passed', async () => {
    getToolVersion.mockImplementation(async (tool) => {
      if (tool === 'samtools') return '1.24';
      if (tool === 'tabix') return '1.25.0';
      return '1.24';
    });

    const finalConfig = createConfig({
      boundedRangeProxy: true,
      boundedRangeProxyExplicit: true,
    });

    await runDownloadCommand({ finalConfig, regions: ['chr1:1-100'] }, deps);

    expect(finalConfig.boundedRangeProxy).toBe(true);
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('native bounded range support; proxy bypassed'),
    );
  });
});
