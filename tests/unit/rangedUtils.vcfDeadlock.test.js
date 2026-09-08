const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { rangedDownloadVCF } = require('../../js/rangedUtils.cjs');
const { createMockLogger } = require('../helpers/mockFactories');

jest.mock('node:child_process');
jest.mock('node:fs');
jest.mock('../../js/fileUtils.cjs');

/**
 * Creates a mock child process for testing stream piping.
 *
 * @returns {object} Mock child process with EventEmitter streams and kill spy.
 */
function createMockProcess() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stdout.pipe = jest.fn();
  proc.stderr = new EventEmitter();
  proc.stdin = new EventEmitter();
  proc.killed = false;
  proc.kill = jest.fn(() => {
    proc.killed = true;
    return true;
  });
  return proc;
}

/**
 * Creates a mock write stream.
 *
 * @returns {EventEmitter} Mock write stream.
 */
function createMockStream() {
  return new EventEmitter();
}

describe('rangedDownloadVCF - pipe deadlock prevention on outputStream error', () => {
  let mockLogger;
  let mockMetrics;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockMetrics = {
      totalFilesDownloaded: 0,
      totalFilesSkipped: 0,
    };
    jest.clearAllMocks();
  });

  test('should reject immediately and terminate tabix and bgzip processes on outputStream error', async () => {
    fs.existsSync.mockReturnValue(false);

    const tabixProcess = createMockProcess();
    const bgzipProcess = createMockProcess();
    const outputStream = createMockStream();

    spawn.mockReturnValueOnce(tabixProcess).mockReturnValueOnce(bgzipProcess);
    fs.createWriteStream.mockReturnValue(outputStream);

    const downloadPromise = rangedDownloadVCF(
      'https://example.com/test.vcf.gz',
      'chr1:1000-2000',
      '/path/to/output.vcf.gz',
      '/path/to/index.tbi',
      mockLogger,
      mockMetrics,
      false,
    );

    const streamError = new Error('ENOSPC: no space left on device');
    outputStream.emit('error', streamError);

    await expect(downloadPromise).rejects.toThrow(
      'Error in outputStream: ENOSPC: no space left on device',
    );

    expect(tabixProcess.kill).toHaveBeenCalledWith('SIGTERM');
    expect(bgzipProcess.kill).toHaveBeenCalledWith('SIGTERM');
  });

  test('should cleanup partial output file when outputStream emits error', async () => {
    fs.existsSync.mockImplementation(
      (file) => file === '/path/to/output.vcf.gz',
    );

    const tabixProcess = createMockProcess();
    const bgzipProcess = createMockProcess();
    const outputStream = createMockStream();

    spawn.mockReturnValueOnce(tabixProcess).mockReturnValueOnce(bgzipProcess);
    fs.createWriteStream.mockReturnValue(outputStream);

    const downloadPromise = rangedDownloadVCF(
      'https://example.com/test.vcf.gz',
      'chr1:1000-2000',
      '/path/to/output.vcf.gz',
      '/path/to/index.tbi',
      mockLogger,
      mockMetrics,
      true,
    );

    const streamError = new Error('EACCES: permission denied');
    outputStream.emit('error', streamError);

    await expect(downloadPromise).rejects.toThrow(
      'Error in outputStream: EACCES: permission denied',
    );

    expect(fs.unlinkSync).toHaveBeenCalledWith('/path/to/output.vcf.gz');
    expect(tabixProcess.kill).toHaveBeenCalledWith('SIGTERM');
    expect(bgzipProcess.kill).toHaveBeenCalledWith('SIGTERM');
  });

  test('should not call kill if child processes are already killed', async () => {
    fs.existsSync.mockReturnValue(false);

    const tabixProcess = createMockProcess();
    tabixProcess.killed = true;
    const bgzipProcess = createMockProcess();
    bgzipProcess.killed = true;
    const outputStream = createMockStream();

    spawn.mockReturnValueOnce(tabixProcess).mockReturnValueOnce(bgzipProcess);
    fs.createWriteStream.mockReturnValue(outputStream);

    const downloadPromise = rangedDownloadVCF(
      'https://example.com/test.vcf.gz',
      'chr1:1000-2000',
      '/path/to/output.vcf.gz',
      '/path/to/index.tbi',
      mockLogger,
      mockMetrics,
      false,
    );

    outputStream.emit('error', new Error('stream write failure'));

    await expect(downloadPromise).rejects.toThrow(
      'Error in outputStream: stream write failure',
    );

    expect(tabixProcess.kill).not.toHaveBeenCalled();
    expect(bgzipProcess.kill).not.toHaveBeenCalled();
  });
});
