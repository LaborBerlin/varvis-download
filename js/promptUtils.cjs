const readline = require('node:readline');
const Mute = require('mute-stream');

/**
 * Prompts the user for a password with hidden/muted input.
 * @param   {string}          promptMessage - The message to display to the user.
 * @returns {Promise<string>}               - The entered password.
 */
async function promptPassword(promptMessage = 'Please enter your password: ') {
  const mute = new Mute();
  mute.pipe(process.stdout);
  const rl = readline.createInterface({
    input: process.stdin,
    output: mute,
    terminal: true,
  });

  return new Promise((resolve) => {
    rl.question(promptMessage, (input) => {
      resolve(input);
      rl.close();
      mute.end();
      // Print a newline since muted input doesn't show one
      process.stdout.write('\n');
    });
  });
}

/**
 * Prompts the user with a yes/no question.
 * @param   {string}           question - The question to ask.
 * @param   {object}           rl       - The readline interface instance.
 * @returns {Promise<boolean>}          - True if user confirms (y/yes), false otherwise.
 */
async function promptYesNo(question, rl) {
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      const normalized = answer.toLowerCase().trim();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

/**
 * Prompts the user to select from multiple options.
 * @param   {string}          question - The question to ask.
 * @param   {string[]}        options  - Array of option strings.
 * @param   {object}          rl       - The readline interface instance.
 * @returns {Promise<number>}          - The index of the selected option (0-based), or -1 if invalid.
 */
async function promptSelect(question, options, rl) {
  const optionsText = options
    .map((opt, index) => `  ${index + 1}. ${opt}`)
    .join('\n');
  const fullPrompt = `${question}\n${optionsText}\nEnter selection (1-${options.length}): `;

  return new Promise((resolve) => {
    rl.question(fullPrompt, (answer) => {
      const selection = Number.parseInt(answer.trim(), 10);
      if (
        Number.isNaN(selection) ||
        selection < 1 ||
        selection > options.length
      ) {
        resolve(-1);
      } else {
        resolve(selection - 1);
      }
    });
  });
}

/**
 * Creates a standard readline interface for user interaction.
 * @returns {import('readline').Interface} - A readline interface instance.
 */
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

module.exports = {
  promptPassword,
  promptYesNo,
  promptSelect,
  createReadlineInterface,
};
