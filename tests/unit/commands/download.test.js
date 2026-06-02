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

jest.mock('../../../js/toolChecks.cjs', () => ({
  checkToolAvailability: jest.fn(async () => true),
}));

const { runDownloadCommand } = require('../../../js/commands/download.cjs');
const { handleBamFile } = require('../../../js/download/bamHandler.cjs');
const { handleVcfFile } = require('../../../js/download/vcfHandler.cjs');
const { handleUrlListing } = require('../../../js/io/urlListing.cjs');

jest.mock('../../../js/io/urlListing.cjs', () => ({
  handleUrlListing: jest.fn(),
}));

describe('commands/download.runDownloadCommand', () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('dispatches BAM primary files to handleBamFile', async () => {
    await runDownloadCommand(
      {
        finalConfig: {
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
          restorationFile: 'awaiting-restoration.json',
          restoreArchived: 'ask',
          sampleIds: [],
          target: 'demo',
          unmapped: false,
          urlFile: null,
        },
        regions: [],
      },
      deps,
    );

    expect(handleBamFile).toHaveBeenCalled();
    expect(handleVcfFile).not.toHaveBeenCalled();
  });

  test('handles URL listing mode without dispatching downloads', async () => {
    await runDownloadCommand(
      {
        finalConfig: {
          analysisIds: ['A1'],
          bed: null,
          destination: '/tmp',
          filetypes: ['bam'],
          filters: [],
          latest: false,
          limsIds: [],
          listUrls: true,
          overwrite: false,
          range: null,
          restorationFile: 'awaiting-restoration.json',
          restoreArchived: 'ask',
          sampleIds: [],
          target: 'demo',
          unmapped: false,
          urlFile: null,
        },
        regions: [],
      },
      deps,
    );

    expect(handleUrlListing).toHaveBeenCalledWith(
      ['https://primary'],
      null,
      mockLogger,
    );
    expect(handleBamFile).not.toHaveBeenCalled();
  });
});
