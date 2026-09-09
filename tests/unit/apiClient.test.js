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
          headers: {
            'User-Agent': 'varvis-download',
            'Sec-Fetch-Mode': 'same-origin',
          },
          dispatcher: mockAgent,
          signal: expect.any(AbortSignal),
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
          headers: {
            'User-Agent': 'varvis-download',
            'Sec-Fetch-Mode': 'same-origin',
            'Content-Type': 'application/json',
          },
          dispatcher: mockAgent,
          signal: expect.any(AbortSignal),
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

      test('should throw without fetching when retries is zero', async () => {
        const client = new ApiClient(mockAgent, mockLogger);

        await expect(
          client.fetchWithRetry('https://api.example.com', {}, 0),
        ).rejects.toThrow('Fetch failed without executing a request');

        expect(undici.fetch).not.toHaveBeenCalled();
      });

      test('fails fast on 404 without retrying', async () => {
        undici.fetch.mockResolvedValue({ ok: false, status: 404 });

        const client = new ApiClient(mockAgent, mockLogger);

        await expect(
          client.fetchWithRetry('https://api.example.com', {}, 3),
        ).rejects.toThrow('Fetch failed with status: 404');

        expect(undici.fetch).toHaveBeenCalledTimes(1);
        expect(mockLogger.warn).not.toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Fetch failed after 1 attempt: Fetch failed with status: 404',
        );
      });

      test('retries on 429 (rate limited) then succeeds', async () => {
        jest.useFakeTimers();
        const successResponse = { ok: true, status: 200 };
        undici.fetch
          .mockResolvedValueOnce({ ok: false, status: 429 })
          .mockResolvedValueOnce(successResponse);

        const client = new ApiClient(mockAgent, mockLogger);
        const promise = client.fetchWithRetry('https://api.example.com', {}, 3);
        await jest.advanceTimersByTimeAsync(1000);
        const response = await promise;

        expect(response).toBe(successResponse);
        expect(undici.fetch).toHaveBeenCalledTimes(2);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Fetch attempt 1 failed. Retrying...',
        );
        jest.useRealTimers();
      });

      test('attaches a fresh per-attempt timeout signal by default (#152)', async () => {
        const mockError = new Error('Network timeout');
        const mockResponse = { ok: true, status: 200 };
        undici.fetch
          .mockRejectedValueOnce(mockError)
          .mockResolvedValueOnce(mockResponse);

        const client = new ApiClient(mockAgent, mockLogger);
        await client.fetchWithRetry('https://api.example.com', {
          jitter: false,
        });

        expect(undici.fetch).toHaveBeenCalledTimes(2);
        const firstCallSignal = undici.fetch.mock.calls[0][1].signal;
        const secondCallSignal = undici.fetch.mock.calls[1][1].signal;
        expect(firstCallSignal).toBeInstanceOf(AbortSignal);
        expect(secondCallSignal).toBeInstanceOf(AbortSignal);
        expect(firstCallSignal).not.toBe(secondCallSignal);
      });

      test('omits timeout signal when timeout is 0 or null (#152)', async () => {
        const mockResponse = { ok: true, status: 200 };
        undici.fetch.mockResolvedValueOnce(mockResponse);

        const client = new ApiClient(mockAgent, mockLogger);
        await client.fetchWithRetry('https://api.example.com', { timeout: 0 });

        expect(undici.fetch).toHaveBeenCalledTimes(1);
        expect(undici.fetch.mock.calls[0][1].signal).toBeUndefined();
      });

      test('cancels response body on non-ok response before retry and terminal error (#152)', async () => {
        const cancel1 = jest.fn();
        const cancel2 = jest.fn();
        const failedResponse1 = {
          ok: false,
          status: 500,
          body: { cancel: cancel1 },
        };
        const failedResponse2 = {
          ok: false,
          status: 500,
          body: { cancel: cancel2 },
        };

        undici.fetch
          .mockResolvedValueOnce(failedResponse1)
          .mockResolvedValueOnce(failedResponse2);

        const client = new ApiClient(mockAgent, mockLogger);
        await expect(
          client.fetchWithRetry(
            'https://api.example.com',
            { jitter: false },
            2,
          ),
        ).rejects.toThrow('Fetch failed with status: 500');

        expect(cancel1).toHaveBeenCalledTimes(1);
        expect(cancel2).toHaveBeenCalledTimes(1);
      });

      test('stops retries immediately when caller abort signal is triggered (#152)', async () => {
        const controller = new AbortController();
        controller.abort();

        const client = new ApiClient(mockAgent, mockLogger);
        await expect(
          client.fetchWithRetry('https://api.example.com', {
            signal: controller.signal,
          }),
        ).rejects.toThrow();

        expect(undici.fetch).not.toHaveBeenCalled();
      });

      test('applies equal jitter to backoff delay when jitter is true (#152)', async () => {
        jest.useFakeTimers();
        const mockError = new Error('Transient error');
        const mockResponse = { ok: true, status: 200 };

        undici.fetch
          .mockRejectedValueOnce(mockError)
          .mockResolvedValueOnce(mockResponse);

        const client = new ApiClient(mockAgent, mockLogger);
        const promise = client.fetchWithRetry('https://api.example.com', {
          jitter: true,
        });

        // Nominal backoff for attempt 1 is 1000ms. Jitter bounds: [500ms, 1000ms].
        await jest.advanceTimersByTimeAsync(499);
        expect(undici.fetch).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(502);
        await promise;
        expect(undici.fetch).toHaveBeenCalledTimes(2);

        jest.useRealTimers();
      });

      test('strips timeout and jitter wrapper options before forwarding to undici.fetch (#152)', async () => {
        const mockResponse = { ok: true, status: 200 };
        undici.fetch.mockResolvedValueOnce(mockResponse);

        const client = new ApiClient(mockAgent, mockLogger);
        await client.fetchWithRetry('https://api.example.com', {
          timeout: 5000,
          jitter: false,
        });

        const forwardedOpts = undici.fetch.mock.calls[0][1];
        expect(forwardedOpts.timeout).toBeUndefined();
        expect(forwardedOpts.jitter).toBeUndefined();
      });

      test('retries when response body read times out during attempt (#152)', async () => {
        const slowBodyResponse = {
          ok: true,
          status: 200,
          body: {},
          text: jest.fn().mockRejectedValueOnce(
            Object.assign(
              new Error('The operation was aborted due to timeout'),
              {
                name: 'TimeoutError',
              },
            ),
          ),
        };
        const okResponse = {
          ok: true,
          status: 200,
          body: {},
          text: jest.fn().mockResolvedValueOnce('{"data":"recovered"}'),
        };

        undici.fetch
          .mockResolvedValueOnce(slowBodyResponse)
          .mockResolvedValueOnce(okResponse);

        const client = new ApiClient(mockAgent, mockLogger);
        const response = await client.fetchWithRetry(
          'https://api.example.com',
          { jitter: false },
          2,
        );

        expect(undici.fetch).toHaveBeenCalledTimes(2);
        const data = await response.json();
        expect(data).toEqual({ data: 'recovered' });
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
        expect.objectContaining({
          dispatcher: mockAgent,
        }),
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
