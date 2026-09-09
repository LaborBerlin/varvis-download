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
    totalFilesFailed: 0,
  },
}));
jest.mock('../../../js/download/bamHandler.cjs', () => ({
  handleBamFile: jest.fn(),
}));
jest.mock('../../../js/download/vcfHandler.cjs', () => ({
  handleVcfFile: jest.fn(),
}));
jest.mock('../../../js/toolChecks.cjs', () => ({
  checkToolAvailability: jest.fn(async () => true),
}));
jest.mock('../../../js/io/urlListing.cjs', () => ({
  handleUrlListing: jest.fn(),
}));

const fs = require('node:fs');
const { runDownloadCommand } = require('../../../js/commands/download.cjs');
const {
  fetchAnalysisIds,
  getDownloadLinks,
} = require('../../../js/fetchUtils.cjs');
const { handleBamFile } = require('../../../js/download/bamHandler.cjs');
const { handleVcfFile } = require('../../../js/download/vcfHandler.cjs');
const { checkToolAvailability } = require('../../../js/toolChecks.cjs');
const { OperationalError } = require('../../../js/errors.cjs');

const mockLogger = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

const deps = {
  agent: { id: 'agent' },
  authService: { token: 'tok' },
  logger: mockLogger,
  metrics: {},
  rl: { id: 'rl' },
};

/**
 * Builds a finalConfig with sensible defaults, overridable per test.
 * @param   {object} overrides - Fields to override.
 * @returns {object}           - finalConfig object.
 */
function makeConfig(overrides = {}) {
  return {
    analysisIds: ['A1'],
    bed: null,
    destination: '/tmp',
    filetypes: ['bam'],
    filters: [],
    latest: false,
    limsIds: [],
    listUrls: false,
    overwrite: false,
    range: null,
    reportfile: 'report.txt',
    restorationFile: 'awaiting-restoration.json',
    restoreArchived: 'ask',
    sampleIds: [],
    target: 'demo',
    unmapped: false,
    urlFile: null,
    ...overrides,
  };
}

describe('commands/download tool-availability gate', () => {
  test('throws when a ranged download needs samtools but it is missing', async () => {
    checkToolAvailability.mockResolvedValue(false);

    await expect(
      runDownloadCommand(
        {
          finalConfig: makeConfig({ range: 'chr1:1-2' }),
          regions: ['chr1:1-2'],
        },
        deps,
      ),
    ).rejects.toThrow(OperationalError);
    await expect(
      runDownloadCommand(
        {
          finalConfig: makeConfig({ range: 'chr1:1-2' }),
          regions: ['chr1:1-2'],
        },
        deps,
      ),
    ).rejects.toThrow(/samtools/i);
    // The gate must stop before any file dispatch.
    expect(handleBamFile).not.toHaveBeenCalled();
  });

  test('throws when a ranged download needs tabix/bgzip but they are missing', async () => {
    checkToolAvailability.mockImplementation(
      async (tool) => tool === 'samtools',
    );

    await expect(
      runDownloadCommand(
        {
          finalConfig: makeConfig({ range: 'chr1:1-2' }),
          regions: ['chr1:1-2'],
        },
        deps,
      ),
    ).rejects.toThrow(/tabix|bgzip/i);
  });

  test('does not check tabix/bgzip for an unmapped-only (no-range) download', async () => {
    checkToolAvailability.mockResolvedValue(true);

    await runDownloadCommand(
      { finalConfig: makeConfig({ unmapped: true }), regions: [] },
      deps,
    );

    const checkedTools = checkToolAvailability.mock.calls.map(
      (call) => call[0],
    );
    expect(checkedTools).toContain('samtools');
    expect(checkedTools).not.toContain('tabix');
    expect(checkedTools).not.toContain('bgzip');
  });

  test('skips tool checks entirely for a plain full download', async () => {
    checkToolAvailability.mockResolvedValue(true);

    await runDownloadCommand({ finalConfig: makeConfig(), regions: [] }, deps);

    expect(checkToolAvailability).not.toHaveBeenCalled();
  });
});

describe('commands/download dispatch wiring', () => {
  test('passes the correct arguments through to handleBamFile', async () => {
    checkToolAvailability.mockResolvedValue(true);
    getDownloadLinks.mockResolvedValueOnce({
      'sample.bam': { analysisId: 'A1', downloadLink: 'https://primary' },
    });
    const finalConfig = makeConfig({ range: 'chr1:1-2' });

    await runDownloadCommand(
      { finalConfig, regions: ['chr1:1-2'], tempBedPath: '/tmp/regions.bed' },
      deps,
    );

    expect(handleBamFile).toHaveBeenCalledWith(
      {
        fileDict: expect.objectContaining({ 'sample.bam': expect.any(Object) }),
        fileName: 'sample.bam',
        finalConfig,
        regions: ['chr1:1-2'],
        target: 'demo',
        tempBedPath: '/tmp/regions.bed',
      },
      deps,
    );
  });

  test('dispatches VCF primary files to handleVcfFile with the right args', async () => {
    checkToolAvailability.mockResolvedValue(true);
    getDownloadLinks.mockResolvedValueOnce({
      'sample.vcf.gz': { analysisId: 'A1', downloadLink: 'https://vcf' },
    });
    const finalConfig = makeConfig({ filetypes: ['vcf.gz'] });

    await runDownloadCommand({ finalConfig, regions: [] }, deps);

    expect(handleVcfFile).toHaveBeenCalledWith(
      {
        fileDict: expect.objectContaining({
          'sample.vcf.gz': expect.any(Object),
        }),
        fileName: 'sample.vcf.gz',
        finalConfig,
        regions: [],
        target: 'demo',
      },
      deps,
    );
    expect(handleBamFile).not.toHaveBeenCalled();
  });

  test('falls back to fetchAnalysisIds when no analysisIds are supplied', async () => {
    checkToolAvailability.mockResolvedValue(true);
    getDownloadLinks.mockResolvedValueOnce({});

    await runDownloadCommand(
      {
        finalConfig: makeConfig({
          analysisIds: [],
          filters: ['someFilter'],
          latest: true,
          limsIds: ['L1'],
          sampleIds: ['S1'],
        }),
        regions: [],
      },
      deps,
    );

    expect(fetchAnalysisIds).toHaveBeenCalledWith(
      'demo',
      'tok',
      deps.agent,
      ['S1'],
      ['L1'],
      ['someFilter'],
      mockLogger,
      true,
    );
  });
});

describe('commands/download temp BED cleanup', () => {
  test('removes the temp BED file even when the download throws', async () => {
    checkToolAvailability.mockResolvedValue(true);
    getDownloadLinks.mockRejectedValueOnce(new Error('boom'));
    const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
    const tempBedPath = '/tmp/varvis-regions-test.bed';

    await expect(
      runDownloadCommand(
        {
          finalConfig: makeConfig({ range: 'chr1:1-2' }),
          regions: ['chr1:1-2'],
          tempBedPath,
        },
        deps,
      ),
    ).rejects.toThrow('boom');

    expect(unlinkSpy).toHaveBeenCalledWith(tempBedPath);

    existsSpy.mockRestore();
    unlinkSpy.mockRestore();
  });
});

describe('commands/download failure propagation (#155)', () => {
  test('increments totalFilesFailed and throws OperationalError when download handler reports failure', async () => {
    checkToolAvailability.mockResolvedValue(true);
    getDownloadLinks.mockResolvedValueOnce({
      'sample.bam': { analysisId: 'A1', downloadLink: 'https://primary' },
    });
    handleBamFile.mockResolvedValueOnce({ ok: false });

    const localDeps = {
      ...deps,
      metrics: {
        downloadSpeeds: [],
        startTime: 0,
        totalBytesDownloaded: 0,
        totalFilesDownloaded: 0,
        totalFilesFailed: 0,
        totalFilesSkipped: 0,
      },
    };

    await expect(
      runDownloadCommand({ finalConfig: makeConfig(), regions: [] }, localDeps),
    ).rejects.toThrow(OperationalError);

    expect(localDeps.metrics.totalFilesFailed).toBe(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Download completed with 1 failed file(s)'),
    );
  });
});
