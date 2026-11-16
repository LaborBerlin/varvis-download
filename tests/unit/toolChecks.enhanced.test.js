const { checkToolAvailability } = require('../../js/toolChecks.cjs');
/* global setImmediate */
const { createMockLogger } = require('../helpers/mockFactories');
const { spawn } = require('node:child_process');

jest.mock('node:child_process');

describe('toolChecks (enhanced)', () => {
  let mockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    jest.clearAllMocks();
  });

  describe('checkToolAvailability', () => {
    test('should return true when samtools version meets requirement', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
      };

      spawn.mockReturnValue(mockProcess);

      setImmediate(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find(
          (call) => call[0] === 'data',
        )?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('samtools 1.18\n'));
        }

        const closeCallback = mockProcess.on.mock.calls.find(
          (call) => call[0] === 'close',
        )?.[1];
        if (closeCallback) {
          closeCallback(0);
        }
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

    test('should return true when tabix version meets requirement', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
      };

      spawn.mockReturnValue(mockProcess);

      setImmediate(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find(
          (call) => call[0] === 'data',
        )?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('tabix (htslib) 1.20\n'));
        }

        const closeCallback = mockProcess.on.mock.calls.find(
          (call) => call[0] === 'close',
        )?.[1];
        if (closeCallback) {
          closeCallback(0);
        }
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
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
      };

      spawn.mockReturnValue(mockProcess);

      setImmediate(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find(
          (call) => call[0] === 'data',
        )?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('samtools 1.15\n'));
        }

        const closeCallback = mockProcess.on.mock.calls.find(
          (call) => call[0] === 'close',
        )?.[1];
        if (closeCallback) {
          closeCallback(0);
        }
      });

      const result = await checkToolAvailability(
        'samtools',
        'samtools --version',
        '1.17',
        mockLogger,
      );

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'samtools version 1.15 is less than the required version 1.17.',
      );
    });

    test('should return false on tool execution error', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
      };

      spawn.mockReturnValue(mockProcess);

      setImmediate(() => {
        const errorCallback = mockProcess.on.mock.calls.find(
          (call) => call[0] === 'error',
        )?.[1];
        if (errorCallback) {
          errorCallback(new Error('Command not found'));
        }
      });

      const result = await checkToolAvailability(
        'samtools',
        'samtools --version',
        '1.17',
        mockLogger,
      );

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error checking samtools version: Command not found',
      );
    });
  });
});
