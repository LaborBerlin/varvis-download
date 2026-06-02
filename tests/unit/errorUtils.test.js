const { getErrorMessage, getErrorStack } = require('../../js/errorUtils.cjs');

describe('errorUtils', () => {
  test('returns message from Error instances', () => {
    expect(getErrorMessage(new Error('network failed'))).toBe('network failed');
  });

  test('returns message from error-like objects', () => {
    expect(getErrorMessage({ message: 'custom failure' })).toBe(
      'custom failure',
    );
  });

  test('falls back to string conversion for non-error values', () => {
    expect(getErrorMessage('plain failure')).toBe('plain failure');
    expect(getErrorMessage(null)).toBe('null');
  });

  test('returns stack only for Error instances', () => {
    const error = new Error('with stack');

    expect(getErrorStack(error)).toBe(error.stack);
    expect(getErrorStack({ message: 'without stack' })).toBeUndefined();
  });
});
