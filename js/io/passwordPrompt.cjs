const readline = require('node:readline');
const DefaultMuteStream = require('mute-stream');

/**
 * @typedef {object} PasswordPromptDeps
 * @property {typeof readline.createInterface} [createInterface] - readline factory.
 * @property {NodeJS.ReadStream}                [stdin]           - Input stream.
 * @property {NodeJS.WriteStream}               [stdout]          - Output stream.
 * @property {typeof DefaultMuteStream}         [MuteStream]      - Mute stream constructor.
 */

/**
 * Prompts for a password with terminal echo muted.
 *
 * @param   {PasswordPromptDeps} deps - Injectable dependencies for tests.
 * @returns {Promise<string>}         - Typed password.
 */
async function promptForPassword(deps = {}) {
  const createInterface = deps.createInterface || readline.createInterface;
  const stdin = deps.stdin || process.stdin;
  const stdout = deps.stdout || process.stdout;
  const MuteStream = deps.MuteStream || DefaultMuteStream;
  const promptText = 'Please enter your Varvis password: ';

  stdout.write(promptText);

  const mute = new MuteStream();
  mute.pipe(stdout);
  mute.mute();
  const rl = createInterface({
    input: stdin,
    output: mute,
    terminal: true,
  });

  return new Promise((resolve) => {
    rl.question('', (input) => {
      resolve(input);
      rl.close();
      mute.unmute();
      mute.end();
      stdout.write('\n');
    });
  });
}

module.exports = { promptForPassword };
