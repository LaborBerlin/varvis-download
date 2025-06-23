const AuthService = require('../../js/authService');

// Mock undici fetch
jest.mock('undici', () => ({
  fetch: jest.fn(),
}));

const { fetch } = require('undici');

describe('AuthService Integration Tests', () => {
  let authService;
  let mockLogger;
  let mockAgent;

  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    // Create mock agent
    mockAgent = {};

    // Create AuthService instance
    authService = new AuthService(mockLogger, mockAgent);

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('getCsrfToken', () => {
    test('should fetch CSRF token successfully', async () => {
      const expectedToken = 'test-csrf-token-123';
      const target = 'test';

      // Mock the fetch response
      fetch.mockResolvedValue({
        headers: {
          get: jest.fn().mockReturnValue(expectedToken),
        },
      });

      const token = await authService.getCsrfToken(target);

      expect(token).toBe(expectedToken);
      expect(fetch).toHaveBeenCalledWith(
        `https://${target}.varvis.com/authenticate`,
        {
          method: 'HEAD',
          dispatcher: mockAgent,
        },
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Fetching CSRF token from https://${target}.varvis.com/authenticate`,
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Received CSRF token: ${expectedToken}`,
      );
    });

    test('should handle errors when fetching CSRF token', async () => {
      const target = 'test';

      // Mock a failed request
      fetch.mockRejectedValue(new Error('Network error'));

      await expect(authService.getCsrfToken(target)).rejects.toThrow(
        'Network error',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    test('should login successfully and retrieve CSRF token', async () => {
      const target = 'test';
      const user = {
        username: 'testuser',
        password: 'testpass',
      };
      const initialToken = 'initial-csrf-token';
      const finalToken = 'final-csrf-token';

      // Mock the sequence of fetch calls
      fetch
        .mockResolvedValueOnce({
          headers: { get: jest.fn().mockReturnValue(initialToken) },
        })
        .mockResolvedValueOnce({
          status: 200,
        })
        .mockResolvedValueOnce({
          headers: { get: jest.fn().mockReturnValue(finalToken) },
        });

      const result = await authService.login(user, target);

      expect(result.csrfToken).toBe(finalToken);
      expect(authService.token).toBe(finalToken);
      expect(mockLogger.info).toHaveBeenCalledWith('Login successful');
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    test('should handle login failure', async () => {
      const target = 'test';
      const user = {
        username: 'testuser',
        password: 'wrongpass',
      };
      const initialToken = 'initial-csrf-token';

      // Mock initial CSRF token success, then login failure
      fetch
        .mockResolvedValueOnce({
          headers: { get: jest.fn().mockReturnValue(initialToken) },
        })
        .mockResolvedValueOnce({
          status: 401,
        });

      await expect(authService.login(user, target)).rejects.toThrow(
        'Login failed',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should handle network errors during login', async () => {
      const target = 'test';
      const user = {
        username: 'testuser',
        password: 'testpass',
      };

      // Mock initial CSRF token request that fails
      fetch.mockRejectedValue(new Error('Connection refused'));

      await expect(authService.login(user, target)).rejects.toThrow(
        'Connection refused',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should handle missing CSRF token in response', async () => {
      const target = 'test';

      // Mock request without token header
      fetch.mockResolvedValue({
        headers: { get: jest.fn().mockReturnValue(null) },
      });

      const result = await authService.getCsrfToken(target);
      expect(result).toBeNull();
    });
  });

  describe('Full authentication flow', () => {
    test('should complete full authentication workflow', async () => {
      const target = 'prod';
      const user = {
        username: 'realuser',
        password: 'realpass',
      };
      const tokens = ['token1', 'token2'];

      // Mock the complete flow
      fetch
        .mockResolvedValueOnce({
          headers: { get: jest.fn().mockReturnValue(tokens[0]) },
        })
        .mockResolvedValueOnce({
          status: 200,
        })
        .mockResolvedValueOnce({
          headers: { get: jest.fn().mockReturnValue(tokens[1]) },
        });

      const result = await authService.login(user, target);

      expect(result.csrfToken).toBe(tokens[1]);
      expect(authService.token).toBe(tokens[1]);
      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });
});
