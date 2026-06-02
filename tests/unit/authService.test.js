const { fetch } = require('undici');
const AuthService = require('../../js/authService.cjs');
const { createMockLogger } = require('../helpers/mockFactories');

jest.mock('undici');

describe('AuthService', () => {
  const mockAgent = { name: 'mockAgent' };
  let mockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    jest.clearAllMocks();
  });

  function responseWithToken(token) {
    return {
      headers: {
        get: jest.fn(() => token),
      },
    };
  }

  test('throws when the initial authentication response has no CSRF token', async () => {
    fetch.mockResolvedValue(responseWithToken(null));
    const authService = new AuthService(mockLogger, mockAgent);

    await expect(authService.getCsrfToken('demo')).rejects.toThrow(
      'CSRF token missing from authentication response',
    );
  });

  test('throws when the post-login authentication response has no CSRF token', async () => {
    fetch
      .mockResolvedValueOnce(responseWithToken('initial-token'))
      .mockResolvedValueOnce({ status: 200, redirected: false })
      .mockResolvedValueOnce(responseWithToken(null));
    const authService = new AuthService(mockLogger, mockAgent);

    await expect(
      authService.login(
        { username: 'varvis-user', password: 'varvis-password' },
        'demo',
      ),
    ).rejects.toThrow(
      'CSRF token missing from post-login authentication response',
    );
  });
});
