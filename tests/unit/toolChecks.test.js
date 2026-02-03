const { spawn } = require('node:child_process');

// Mock child_process.spawn
jest.mock('node:child_process');

const {
  compareVersions,
  spawnPromise,
  checkToolAvailability,
} = require('../../js/toolChecks.cjs');

describe('toolChecks', () => {
  let mockLogger;
  let mockSpawnProcess;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    // Create mock spawn process with EventEmitter-like behavior
    mockSpawnProcess = {
      stdout: {
        on: jest.fn(),
      },
      stderr: {
        on: jest.fn(),
      },
      on: jest.fn(),
    };

    spawn.mockReturnValue(mockSpawnProcess);
    jest.clearAllMocks();
  });

  describe('compareVersions', () => {
    test('should return true when version is greater than minimum', () => {
      expect(compareVersions('1.18', '1.17')).toBe(true);
      expect(compareVersions('2.0', '1.17')).toBe(true);
      expect(compareVersions('1.17.1', '1.17')).toBe(true);
    });

    test('should return true when version equals minimum', () => {
      expect(compareVersions('1.17', '1.17')).toBe(true);
      expect(compareVersions('1.20.0', '1.20')).toBe(true);
    });

    test('should return false when version is less than minimum', () => {
      expect(compareVersions('1.16', '1.17')).toBe(false);
      expect(compareVersions('1.16.9', '1.17')).toBe(false);
      expect(compareVersions('0.9', '1.0')).toBe(false);
    });

    test('should handle complex version numbers', () => {
      expect(compareVersions('1.20.3', '1.20.1')).toBe(true);
      expect(compareVersions('1.20.1', '1.20.3')).toBe(false);
      expect(compareVersions('2.0.0', '1.99.99')).toBe(true);
    });

    test('should handle versions with different lengths', () => {
      expect(compareVersions('1.20', '1.20.0')).toBe(true);
      expect(compareVersions('1.20.0', '1.20')).toBe(true);
      expect(compareVersions('1.20', '1.20.1')).toBe(false);
    });

    test('should handle single-digit versions', () => {
      expect(compareVersions('2', '1')).toBe(true);
      expect(compareVersions('1', '2')).toBe(false);
      expect(compareVersions('1', '1')).toBe(true);
    });
  });

  describe('spawnPromise', () => {
    test('should resolve on successful process completion', async () => {
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 0);
        }
        return mockSpawnProcess;
      });

      const result = await spawnPromise('echo', ['hello'], mockLogger);
      expect(result).toEqual({});
      expect(spawn).toHaveBeenCalledWith('echo', ['hello']);
    });

    test('should capture stdout when captureOutput is true', async () => {
      mockSpawnProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('test output'));
        }
      });
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 0);
        }
        return mockSpawnProcess;
      });

      const result = await spawnPromise('echo', ['hello'], mockLogger, true);
      expect(result).toEqual({ stdout: 'test output' });
    });

    test('should reject on non-zero exit code', async () => {
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 0);
        }
        return mockSpawnProcess;
      });

      await expect(spawnPromise('false', [], mockLogger)).rejects.toThrow(
        'Process false exited with code 1',
      );
    });

    test('should reject on spawn error', async () => {
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('spawn failed')), 0);
        }
        return mockSpawnProcess;
      });

      await expect(spawnPromise('nonexistent', [], mockLogger)).rejects.toThrow(
        'spawn failed',
      );
    });

    test('should log stdout and stderr', async () => {
      mockSpawnProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('stdout message'));
        }
      });
      mockSpawnProcess.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('stderr message'));
        }
      });
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 0);
        }
        return mockSpawnProcess;
      });

      await spawnPromise('test', [], mockLogger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[test] stdout: stdout message',
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[test] stderr: stderr message',
      );
    });
  });

  describe('checkToolAvailability', () => {
    test('should return true when tool version meets requirement (samtools format)', async () => {
      mockSpawnProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('samtools 1.18'));
        }
      });
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 0);
        }
        return mockSpawnProcess;
      });

      const result = await checkToolAvailability(
        'samtools',
        'samtools --version',
        '1.17',
        mockLogger,
      );

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'samtools version 1.18 is available.',
      );
    });

    test('should return true when tool version meets requirement (tabix format)', async () => {
      mockSpawnProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('tabix (htslib) 1.20'));
        }
      });
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 0);
        }
        return mockSpawnProcess;
      });

      const result = await checkToolAvailability(
        'tabix',
        'tabix --version',
        '1.7',
        mockLogger,
      );

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'tabix version 1.20 is available.',
      );
    });

    test('should return false when tool version is below requirement', async () => {
      mockSpawnProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('samtools 1.16'));
        }
      });
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 0);
        }
        return mockSpawnProcess;
      });

      const result = await checkToolAvailability(
        'samtools',
        'samtools --version',
        '1.17',
        mockLogger,
      );

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'samtools version 1.16 is less than the required version 1.17.',
      );
    });

    test('should return false when tool command fails', async () => {
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('command not found')), 0);
        }
        return mockSpawnProcess;
      });

      const result = await checkToolAvailability(
        'samtools',
        'samtools --version',
        '1.17',
        mockLogger,
      );

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error checking samtools version: command not found',
      );
    });

    test('should parse version command correctly', async () => {
      mockSpawnProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('tool 1.0'));
        }
      });
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 0);
        }
        return mockSpawnProcess;
      });

      await checkToolAvailability(
        'tool',
        'tool --version --verbose',
        '1.0',
        mockLogger,
      );

      expect(spawn).toHaveBeenCalledWith('tool', ['--version', '--verbose']);
    });
  });
});
