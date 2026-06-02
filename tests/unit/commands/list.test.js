jest.mock('../../../js/fetchUtils.cjs', () => ({
  fetchAnalysisIds: jest.fn(async () => ['fetched-1']),
  listAvailableFiles: jest.fn(),
}));

const { runListCommand } = require('../../../js/commands/list.cjs');
const {
  fetchAnalysisIds,
  listAvailableFiles,
} = require('../../../js/fetchUtils.cjs');

describe('commands/list.runListCommand', () => {
  const mockLogger = {
    error: jest.fn(),
    info: jest.fn(),
  };
  const deps = {
    agent: {},
    authService: { token: 'tok' },
    logger: mockLogger,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uses provided analysisIds when present', async () => {
    await runListCommand(
      {
        finalConfig: {
          analysisIds: ['A1', 'A2'],
          filters: [],
          latest: false,
          limsIds: [],
          sampleIds: [],
          target: 'demo',
        },
      },
      deps,
    );

    expect(fetchAnalysisIds).not.toHaveBeenCalled();
    expect(listAvailableFiles).toHaveBeenCalledTimes(2);
  });

  test('falls back to fetchAnalysisIds when no analysisIds are present', async () => {
    await runListCommand(
      {
        finalConfig: {
          analysisIds: [],
          filters: [],
          latest: true,
          limsIds: [],
          sampleIds: ['S1'],
          target: 'demo',
        },
      },
      deps,
    );

    expect(fetchAnalysisIds).toHaveBeenCalledWith(
      'demo',
      'tok',
      deps.agent,
      ['S1'],
      [],
      [],
      mockLogger,
      true,
    );
    expect(listAvailableFiles).toHaveBeenCalledTimes(1);
  });
});
