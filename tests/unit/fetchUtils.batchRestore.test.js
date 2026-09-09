const { getDownloadLinks } = require('../../js/fetchUtils.cjs');
const archiveUtils = require('../../js/archiveUtils.cjs');
const restorationState = require('../../js/restorationState.cjs');
const apiClient = require('../../js/apiClient.cjs');
const { createMockLogger } = require('../helpers/mockFactories');

jest.mock('../../js/apiClient.cjs');
jest.mock('../../js/archiveUtils.cjs', () => {
  const actual = jest.requireActual('../../js/archiveUtils.cjs');
  return {
    ...actual,
    triggerRestoreArchivedFile: jest.fn(),
  };
});
jest.mock('../../js/restorationState.cjs', () => {
  const actual = jest.requireActual('../../js/restorationState.cjs');
  return {
    ...actual,
    appendBatchToAwaitingRestoration: jest.fn(async () => {}),
  };
});

describe('fetchUtils batch restoration (#153)', () => {
  let mockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    jest.clearAllMocks();
  });

  test('calls triggerRestoreArchivedFile once per analysis and batches all entries into a single disk write', async () => {
    const analysisResponse = {
      response: {
        apiFileLinks: [
          { fileName: 'sample.bam', currentlyArchived: true },
          { fileName: 'sample2.bam', currentlyArchived: true },
          { fileName: 'sample3.bam', currentlyArchived: true },
        ],
      },
    };

    apiClient.fetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: async () => analysisResponse,
    });

    archiveUtils.triggerRestoreArchivedFile.mockResolvedValueOnce({
      analysisId: 'AN001',
      fileName: 'sample.bam',
      restoreEstimation: '2026-09-10T12:00:00Z',
      options: { destination: '/data' },
    });

    await getDownloadLinks(
      'AN001',
      null,
      'demo',
      'token-123',
      {},
      mockLogger,
      'force',
      null,
      'test-restoration.json',
      { destination: '/data' },
    );

    // Endpoint trigger called ONCE for the analysis, with persistState = false
    expect(archiveUtils.triggerRestoreArchivedFile).toHaveBeenCalledTimes(1);
    expect(archiveUtils.triggerRestoreArchivedFile).toHaveBeenCalledWith(
      'AN001',
      analysisResponse.response.apiFileLinks[0],
      'demo',
      'token-123',
      expect.anything(),
      mockLogger,
      'test-restoration.json',
      { destination: '/data' },
      false,
    );

    // All 3 archived files batched into ONE call to appendBatchToAwaitingRestoration
    expect(
      restorationState.appendBatchToAwaitingRestoration,
    ).toHaveBeenCalledTimes(1);
    expect(
      restorationState.appendBatchToAwaitingRestoration,
    ).toHaveBeenCalledWith(
      [
        {
          analysisId: 'AN001',
          fileName: 'sample.bam',
          restoreEstimation: '2026-09-10T12:00:00Z',
          options: { destination: '/data' },
        },
        {
          analysisId: 'AN001',
          fileName: 'sample2.bam',
          restoreEstimation: '2026-09-10T12:00:00Z',
          options: { destination: '/data' },
        },
        {
          analysisId: 'AN001',
          fileName: 'sample3.bam',
          restoreEstimation: '2026-09-10T12:00:00Z',
          options: { destination: '/data' },
        },
      ],
      mockLogger,
      'test-restoration.json',
    );
  });
});
