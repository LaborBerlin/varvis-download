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

  test('attaches request deadline timeout signal to getCsrfToken (#152)', async () => {
    fetch.mockResolvedValueOnce(responseWithToken('sample-csrf-token'));
    const authService = new AuthService(mockLogger, mockAgent);

    const token = await authService.getCsrfToken('demo');
    expect(token).toBe('sample-csrf-token');
    expect(fetch).toHaveBeenCalledWith(
      'https://demo.varvis.com/authenticate',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  test('attaches request deadline timeout signals to login flow (#152)', async () => {
    fetch
      .mockResolvedValueOnce(responseWithToken('initial-token'))
      .mockResolvedValueOnce({ status: 200, redirected: false })
      .mockResolvedValueOnce(responseWithToken('final-token'));
    const authService = new AuthService(mockLogger, mockAgent);

    const result = await authService.login(
      { username: 'varvis-user', password: 'varvis-password' },
      'demo',
    );

    expect(result).toEqual({ csrfToken: 'final-token' });
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const call of fetch.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    }
  });
});
