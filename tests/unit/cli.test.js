const { execSync } = require('node:child_process');
const path = require('node:path');

describe('CLI (varvis-download.cjs)', () => {
  const cliPath = path.join(__dirname, '../../varvis-download.cjs');

  describe('Version and Help', () => {
    test('should display version information with --version flag', () => {
      const output = execSync(`node ${cliPath} --version`, {
        encoding: 'utf8',
      });

      expect(output).toContain('Version');
      expect(output).toContain('varvis-download');
    });

    test('should display help information with --help flag', () => {
      const output = execSync(`node ${cliPath} --help`, {
        encoding: 'utf8',
      });

      expect(output).toContain('Options');
      expect(output).toContain('username');
      expect(output).toContain('password');
      expect(output).toContain('target');
    });
  });

  describe('Required Argument Validation', () => {
    test('should exit with error when username is missing', () => {
      try {
        execSync(
          `node ${cliPath} --password test --target testenv --analysisIds AN001`,
          { encoding: 'utf8', stdio: 'pipe' },
        );
      } catch (error) {
        expect(error.status).toBe(1);
        expect(error.stderr || error.stdout).toContain('username');
      }
    });

    test('should exit with error when password is missing', () => {
      try {
        execSync(
          `node ${cliPath} --username test --target testenv --analysisIds AN001`,
          { encoding: 'utf8', stdio: 'pipe' },
        );
      } catch (error) {
        expect(error.status).toBe(1);
        expect(error.stderr || error.stdout).toContain('password');
      }
    });

    test('should exit with error when target is missing', () => {
      try {
        execSync(
          `node ${cliPath} --username test --password test --analysisIds AN001`,
          { encoding: 'utf8', stdio: 'pipe' },
        );
      } catch (error) {
        expect(error.status).toBe(1);
        expect(error.stderr || error.stdout).toContain('target');
      }
    });

    test('should exit with error when no analysis identifiers provided', () => {
      try {
        execSync(
          `node ${cliPath} --username test --password test --target testenv`,
          { encoding: 'utf8', stdio: 'pipe' },
        );
      } catch (error) {
        expect(error.status).toBe(1);
        expect(error.stderr || error.stdout).toContain(
          'at least one of the following',
        );
      }
    });
  });

  describe('Argument Aliases', () => {
    test('should accept short aliases for common options', () => {
      const helpOutput = execSync(`node ${cliPath} --help`, {
        encoding: 'utf8',
      });

      const aliasTests = [
        { long: 'username', short: '-u' },
        { long: 'password', short: '-p' },
        { long: 'target', short: '-t' },
        { long: 'analysisIds', short: '-a' },
        { long: 'sampleIds', short: '-s' },
        { long: 'limsIds', short: '-l' },
        { long: 'list', short: '-L' },
        { long: 'destination', short: '-d' },
        { long: 'overwrite', short: '-o' },
        { long: 'filetypes', short: '-f' },
        { long: 'range', short: '-g' },
        { long: 'bed', short: '-b' },
      ];

      for (const { long, short } of aliasTests) {
        expect(helpOutput).toContain(long);
      }
    });
  });

  describe('Advanced Features', () => {
    test('should support range download option', () => {
      const helpOutput = execSync(`node ${cliPath} --help`, {
        encoding: 'utf8',
      });

      expect(helpOutput).toContain('range');
      expect(helpOutput).toContain('Genomic');
    });

    test('should support BED file option', () => {
      const helpOutput = execSync(`node ${cliPath} --help`, {
        encoding: 'utf8',
      });

      expect(helpOutput).toContain('bed');
    });

    test('should support list-urls option', () => {
      const helpOutput = execSync(`node ${cliPath} --help`, {
        encoding: 'utf8',
      });

      expect(helpOutput).toContain('list-urls');
    });

    test('should support archive restoration options', () => {
      const helpOutput = execSync(`node ${cliPath} --help`, {
        encoding: 'utf8',
      });

      expect(helpOutput).toContain('restoreArchived');
      expect(helpOutput).toContain('resumeArchivedDownloads');
      expect(helpOutput).toContain('restorationFile');
    });

    test('should support proxy configuration', () => {
      const helpOutput = execSync(`node ${cliPath} --help`, {
        encoding: 'utf8',
      });

      expect(helpOutput).toContain('proxy');
      expect(helpOutput).toContain('proxyUsername');
      expect(helpOutput).toContain('proxyPassword');
    });

    test('should support filtering options', () => {
      const helpOutput = execSync(`node ${cliPath} --help`, {
        encoding: 'utf8',
      });

      expect(helpOutput).toContain('filter');
      expect(helpOutput).toContain('filetypes');
    });

    test('should support logging options', () => {
      const helpOutput = execSync(`node ${cliPath} --help`, {
        encoding: 'utf8',
      });

      expect(helpOutput).toContain('loglevel');
      expect(helpOutput).toContain('logfile');
    });

    test('should support output options', () => {
      const helpOutput = execSync(`node ${cliPath} --help`, {
        encoding: 'utf8',
      });

      expect(helpOutput).toContain('destination');
      expect(helpOutput).toContain('overwrite');
      expect(helpOutput).toContain('reportfile');
    });
  });
});
