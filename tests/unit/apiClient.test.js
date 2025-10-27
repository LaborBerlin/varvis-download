const {
  ApiClient,
  createApiClient,
  fetchWithRetry,
} = require('../../js/apiClient.cjs');
const { createMockLogger } = require('../helpers/mockFactories');
const undici = require('undici');

jest.mock('undici');

describe('apiClient', () => {
  let mockAgent;
  let mockLogger;

  beforeEach(() => {
    mockAgent = { name: 'mockAgent' };
    mockLogger = createMockLogger();
    jest.clearAllMocks();
  });

  describe('ApiClient', () => {
    describe('constructor', () => {
      test('should create ApiClient instance with agent and logger', () => {
        const client = new ApiClient(mockAgent, mockLogger);

        expect(client.agent).toBe(mockAgent);
        expect(client.logger).toBe(mockLogger);
      });
    });

    describe('fetchWithRetry', () => {
      test('should successfully fetch on first attempt', async () => {
        const mockResponse = {
          ok: true,
          status: 200,
          json: async () => ({ data: 'test' }),
        };
        undici.fetch.mockResolvedValueOnce(mockResponse);

        const client = new ApiClient(mockAgent, mockLogger);
        const response = await client.fetchWithRetry(
          'https://api.example.com',
          {},
        );

        expect(response).toBe(mockResponse);
        expect(undici.fetch).toHaveBeenCalledTimes(1);
        expect(undici.fetch).toHaveBeenCalledWith('https://api.example.com', {
          dispatcher: mockAgent,
        });
        expect(mockLogger.warn).not.toHaveBeenCalled();
        expect(mockLogger.error).not.toHaveBeenCalled();
      });

      test('should retry on network failure and succeed on second attempt', async () => {
        const mockError = new Error('Network timeout');
        const mockResponse = { ok: true, status: 200 };

        undici.fetch
          .mockRejectedValueOnce(mockError)
          .mockResolvedValueOnce(mockResponse);

        const client = new ApiClient(mockAgent, mockLogger);
        const response = await client.fetchWithRetry(
          'https://api.example.com',
          {},
          3,
        );

        expect(response).toBe(mockResponse);
        expect(undici.fetch).toHaveBeenCalledTimes(2);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Fetch attempt 1 failed. Retrying...',
        );
      });

      test('should retry on non-ok response status', async () => {
        const failedResponse = { ok: false, status: 500 };
        const successResponse = { ok: true, status: 200 };

        undici.fetch
          .mockResolvedValueOnce(failedResponse)
          .mockResolvedValueOnce(successResponse);

        const client = new ApiClient(mockAgent, mockLogger);
        const response = await client.fetchWithRetry(
          'https://api.example.com',
          {},
          3,
        );

        expect(response).toBe(successResponse);
        expect(undici.fetch).toHaveBeenCalledTimes(2);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Fetch attempt 1 failed. Retrying...',
        );
      });

      test('should throw after exhausting all retries', async () => {
        const mockError = new Error('Connection refused');
        undici.fetch.mockRejectedValue(mockError);

        const client = new ApiClient(mockAgent, mockLogger);

        await expect(
          client.fetchWithRetry('https://api.example.com', {}, 3),
        ).rejects.toThrow('Connection refused');

        expect(undici.fetch).toHaveBeenCalledTimes(3);
        expect(mockLogger.warn).toHaveBeenCalledTimes(2);
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Fetch failed after 3 attempts: Connection refused',
        );
      });

      test('should use exponential backoff between retries', async () => {
        jest.useFakeTimers();
        const mockError = new Error('Timeout');
        const mockResponse = { ok: true, status: 200 };

        undici.fetch
          .mockRejectedValueOnce(mockError)
          .mockRejectedValueOnce(mockError)
          .mockResolvedValueOnce(mockResponse);

        const client = new ApiClient(mockAgent, mockLogger);
        const promise = client.fetchWithRetry('https://api.example.com', {}, 3);

        await jest.advanceTimersByTimeAsync(1000);
        await jest.advanceTimersByTimeAsync(2000);

        await promise;

        expect(undici.fetch).toHaveBeenCalledTimes(3);
        expect(mockLogger.warn).toHaveBeenCalledTimes(2);

        jest.useRealTimers();
      });

      test('should pass options to fetch request', async () => {
        const mockResponse = { ok: true, status: 200 };
        undici.fetch.mockResolvedValueOnce(mockResponse);

        const client = new ApiClient(mockAgent, mockLogger);
        const options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: 'test' }),
        };

        await client.fetchWithRetry('https://api.example.com', options);

        expect(undici.fetch).toHaveBeenCalledWith('https://api.example.com', {
          ...options,
          dispatcher: mockAgent,
        });
      });

      test('should handle different retry counts', async () => {
        const mockError = new Error('Server error');
        undici.fetch.mockRejectedValue(mockError);

        const client = new ApiClient(mockAgent, mockLogger);

        await expect(
          client.fetchWithRetry('https://api.example.com', {}, 5),
        ).rejects.toThrow();

        expect(undici.fetch).toHaveBeenCalledTimes(5);
        expect(mockLogger.warn).toHaveBeenCalledTimes(4);
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Fetch failed after 5 attempts: Server error',
        );
      });
    });
  });

  describe('createApiClient', () => {
    test('should create and return ApiClient instance', () => {
      const client = createApiClient(mockAgent, mockLogger);

      expect(client).toBeInstanceOf(ApiClient);
      expect(client.agent).toBe(mockAgent);
      expect(client.logger).toBe(mockLogger);
    });

    test('should create functional client with working fetchWithRetry', async () => {
      const mockResponse = { ok: true, status: 200 };
      undici.fetch.mockResolvedValueOnce(mockResponse);

      const client = createApiClient(mockAgent, mockLogger);
      const response = await client.fetchWithRetry(
        'https://api.example.com',
        {},
      );

      expect(response).toBe(mockResponse);
      expect(undici.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchWithRetry (legacy function)', () => {
    test('should fetch successfully with agent in dispatcher', async () => {
      const mockResponse = { ok: true, status: 200 };
      undici.fetch.mockResolvedValueOnce(mockResponse);

      const options = { dispatcher: mockAgent };
      const response = await fetchWithRetry(
        'https://api.example.com',
        options,
        3,
        mockLogger,
      );

      expect(response).toBe(mockResponse);
      expect(undici.fetch).toHaveBeenCalledWith(
        'https://api.example.com',
        options,
      );
    });

    test('should throw error when dispatcher is missing', async () => {
      const options = {};

      await expect(
        fetchWithRetry('https://api.example.com', options, 3, mockLogger),
      ).rejects.toThrow('Agent (dispatcher) is required for fetchWithRetry');
    });

    test('should handle retries in legacy function', async () => {
      const mockError = new Error('Network error');
      const mockResponse = { ok: true, status: 200 };

      undici.fetch
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce(mockResponse);

      const options = { dispatcher: mockAgent };
      const response = await fetchWithRetry(
        'https://api.example.com',
        options,
        3,
        mockLogger,
      );

      expect(response).toBe(mockResponse);
      expect(undici.fetch).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Fetch attempt 1 failed. Retrying...',
      );
    });

    test('should use default retries value of 3', async () => {
      const mockError = new Error('Persistent error');
      undici.fetch.mockRejectedValue(mockError);

      const options = { dispatcher: mockAgent };

      await expect(
        fetchWithRetry(
          'https://api.example.com',
          options,
          undefined,
          mockLogger,
        ),
      ).rejects.toThrow('Persistent error');

      expect(undici.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
