const { resolvePassword } = require('../../varvis-download.cjs');
const { ConfigurationError } = require('../../js/errors.cjs');

const ttyStdin = { isTTY: true };
const pipeStdin = { isTTY: false };

describe('resolvePassword precedence', () => {
  test('reads --password-stdin above everything else', async () => {
    const readStdin = jest.fn().mockResolvedValue('from-stdin');
    const logger = { warn: jest.fn() };
    const result = await resolvePassword(
      { passwordStdin: true, password: 'from-config' },
      { readStdin, logger, stdin: pipeStdin },
    );
    expect(result).toBe('from-stdin');
    expect(logger.warn).toHaveBeenCalled(); // warns that stdin overrode --password
  });

  test('returns an already-merged password without prompting', async () => {
    const prompt = jest.fn();
    const result = await resolvePassword(
      { passwordStdin: false, password: 'from-config' },
      { prompt, stdin: ttyStdin },
    );
    expect(result).toBe('from-config');
    expect(prompt).not.toHaveBeenCalled();
  });

  test('prompts on a TTY when no password is available', async () => {
    const prompt = jest.fn().mockResolvedValue('typed');
    const result = await resolvePassword(
      { passwordStdin: false, password: undefined },
      { prompt, stdin: ttyStdin },
    );
    expect(result).toBe('typed');
  });

  test('throws (does not hang) on a non-TTY with no password', async () => {
    await expect(
      resolvePassword(
        { passwordStdin: false, password: undefined },
        { stdin: pipeStdin },
      ),
    ).rejects.toBeInstanceOf(ConfigurationError);
  });
});
