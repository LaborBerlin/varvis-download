const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * Non-resume mode must validate/create the destination directory BEFORE
 * authenticating, so a bad --destination fails fast without a network
 * round-trip (matching the pre-refactor behaviour). We prove the ordering by
 * pointing --destination at a path whose parent is a regular file: creating it
 * throws ENOTDIR. If the failure surfaces before any login attempt, no network
 * request is made and the error names the directory problem, not a login error.
 */
describe('CLI destination-before-auth ordering', () => {
  const cliPath = path.join(__dirname, '../../varvis-download.cjs');
  let workDir;
  let fileAsParent;

  beforeAll(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'varvis-ordering-'));
    fileAsParent = path.join(workDir, 'not-a-directory');
    fs.writeFileSync(fileAsParent, 'x');
  });

  afterAll(() => {
    fs.rmSync(workDir, { force: true, recursive: true });
  });

  test('fails on an uncreatable destination before attempting login', () => {
    const uncreatable = path.join(fileAsParent, 'nested');
    let error;
    try {
      execFileSync(
        'node',
        [
          cliPath,
          '--username',
          'u',
          '--password',
          'p',
          '--target',
          'nonexistent-varvis-ordering-target',
          '--analysisIds',
          'AN001',
          '--destination',
          uncreatable,
        ],
        { encoding: 'utf8', stdio: 'pipe', timeout: 20000 },
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeDefined();
    expect(error.status).toBe(1);
    const output = `${error.stdout || ''}${error.stderr || ''}`;
    // The directory creation failure must be what stops the run...
    expect(output).toMatch(/ENOTDIR|not a directory|mkdir/i);
    // ...and login must never have been reached (no network round-trip).
    expect(output).not.toMatch(/Login|csrf|authenticate/i);
  });
});
