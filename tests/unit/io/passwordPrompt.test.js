const { promptForPassword } = require('../../../js/io/passwordPrompt.cjs');

describe('io/passwordPrompt.promptForPassword', () => {
  test('exists and is async', () => {
    expect(typeof promptForPassword).toBe('function');
    expect(promptForPassword.constructor.name).toBe('AsyncFunction');
  });

  test('resolves typed password with muted readline output', async () => {
    const events = [];
    const stdout = {
      write: jest.fn((chunk) => {
        events.push(`write:${chunk}`);
      }),
    };

    class FakeMuteStream {
      pipe(destination) {
        events.push('pipe');
        return destination;
      }

      mute() {
        events.push('mute');
      }

      unmute() {
        events.push('unmute');
      }

      end() {
        events.push('end');
      }
    }

    const result = await promptForPassword({
      MuteStream: FakeMuteStream,
      createInterface: ({ output }) => {
        expect(output).toBeInstanceOf(FakeMuteStream);
        return {
          question: (prompt, callback) => {
            events.push(`question:${prompt}`);
            callback('typed-password');
          },
          close: () => {
            events.push('close');
          },
        };
      },
      stdin: {},
      stdout,
    });

    expect(result).toBe('typed-password');
    expect(events).toEqual([
      'write:Please enter your Varvis password: ',
      'pipe',
      'mute',
      'question:',
      'close',
      'unmute',
      'end',
      'write:\n',
    ]);
  });
});
