const { ConfigurationError, OperationalError } = require('../../js/errors.cjs');

describe('errors.cjs', () => {
  test('ConfigurationError carries exitCode 1', () => {
    const error = new ConfigurationError('bad config');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error.exitCode).toBe(1);
    expect(error.message).toBe('bad config');
    expect(error.name).toBe('ConfigurationError');
  });

  test('OperationalError defaults exitCode to 1', () => {
    const error = new OperationalError('runtime fail');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(OperationalError);
    expect(error.exitCode).toBe(1);
    expect(error.name).toBe('OperationalError');
  });

  test('OperationalError accepts a custom exitCode', () => {
    const error = new OperationalError('runtime fail', 42);

    expect(error.exitCode).toBe(42);
  });

  test('ConfigurationError is catchable as Error', () => {
    try {
      throw new ConfigurationError('x');
    } catch (error) {
      expect(error instanceof Error).toBe(true);
      expect(error instanceof ConfigurationError).toBe(true);
    }
  });
});
