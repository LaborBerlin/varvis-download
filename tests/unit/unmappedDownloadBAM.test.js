/* global setImmediate */
const {
  unmappedDownloadBAM,
  rangedDownloadBAM,
  generateOutputFileName,
} = require('../../js/rangedUtils.cjs');
const { createMockLogger } = require('../helpers/mockFactories');
const { spawn } = require('node:child_process');
const fs = require('node:fs');

jest.mock('node:child_process');
jest.mock('node:fs');
jest.mock('../../js/fileUtils.cjs');

describe('unmappedDownloadBAM', () => {
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

  test('should call samtools view with wildcard chromosome to extract unmapped reads', async () => {
    fs.existsSync.mockReturnValue(false);

    const mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
    };
    spawn.mockReturnValue(mockProcess);

    setImmediate(() => {
      const closeCallback = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'close',
      )?.[1];
      if (closeCallback) closeCallback(0);
    });

    await unmappedDownloadBAM(
      'https://example.com/sample.bam',
      '/output/sample.unmapped.bam',
      '/output/sample.bam.bai',
      mockLogger,
      mockMetrics,
    );

    expect(spawn).toHaveBeenCalledWith('samtools', [
      'view',
      '-b',
      '-X',
      'https://example.com/sample.bam',
      '/output/sample.bam.bai',
      '*',
      '-o',
      '/output/sample.unmapped.bam',
    ]);
    expect(mockMetrics.totalFilesDownloaded).toBe(1);
  });

  test('should skip download if output file already exists and overwrite is false', async () => {
    fs.existsSync.mockReturnValue(true);

    await unmappedDownloadBAM(
      'https://example.com/sample.bam',
      '/output/sample.unmapped.bam',
      '/output/sample.bam.bai',
      mockLogger,
      mockMetrics,
      false,
    );

    expect(spawn).not.toHaveBeenCalled();
    expect(mockMetrics.totalFilesSkipped).toBe(1);
  });

  test('should proceed with download if overwrite is true even when file exists', async () => {
    fs.existsSync.mockReturnValue(true);

    const mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
    };
    spawn.mockReturnValue(mockProcess);

    setImmediate(() => {
      const closeCallback = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'close',
      )?.[1];
      if (closeCallback) closeCallback(0);
    });

    await unmappedDownloadBAM(
      'https://example.com/sample.bam',
      '/output/sample.unmapped.bam',
      '/output/sample.bam.bai',
      mockLogger,
      mockMetrics,
      true,
    );

    expect(spawn).toHaveBeenCalled();
    expect(mockMetrics.totalFilesDownloaded).toBe(1);
  });

  test('should throw error when samtools process fails', async () => {
    fs.existsSync.mockReturnValue(false);

    const mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
    };
    spawn.mockReturnValue(mockProcess);

    setImmediate(() => {
      const stderrCallback = mockProcess.stderr.on.mock.calls.find(
        (call) => call[0] === 'data',
      )?.[1];
      if (stderrCallback) {
        stderrCallback(Buffer.from('samtools error: cannot open file'));
      }

      const closeCallback = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'close',
      )?.[1];
      if (closeCallback) closeCallback(1);
    });

    await expect(
      unmappedDownloadBAM(
        'https://example.com/sample.bam',
        '/output/sample.unmapped.bam',
        '/output/sample.bam.bai',
        mockLogger,
        mockMetrics,
      ),
    ).rejects.toThrow();

    expect(mockMetrics.totalFilesDownloaded).toBe(0);
  });
});

describe('rangedDownloadBAM with includeUnmapped', () => {
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

  test('should use command-line regions with wildcard when includeUnmapped is true', async () => {
    fs.existsSync.mockReturnValue(false);

    const mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
    };
    spawn.mockReturnValue(mockProcess);

    setImmediate(() => {
      const closeCallback = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'close',
      )?.[1];
      if (closeCallback) closeCallback(0);
    });

    await rangedDownloadBAM(
      'https://example.com/sample.bam',
      '/tmp/regions.bed',
      '/output/sample.region.bam',
      '/output/sample.bam.bai',
      mockLogger,
      mockMetrics,
      false,
      true,
      ['chr1:155184000-155194000'],
    );

    expect(spawn).toHaveBeenCalledWith('samtools', [
      'view',
      '-b',
      '-X',
      'https://example.com/sample.bam',
      '/output/sample.bam.bai',
      'chr1:155184000-155194000',
      '*',
      '-o',
      '/output/sample.region.bam',
    ]);
    expect(mockMetrics.totalFilesDownloaded).toBe(1);
  });

  test('should use BED file with -L -M when includeUnmapped is false', async () => {
    fs.existsSync.mockReturnValue(false);

    const mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
    };
    spawn.mockReturnValue(mockProcess);

    setImmediate(() => {
      const closeCallback = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'close',
      )?.[1];
      if (closeCallback) closeCallback(0);
    });

    await rangedDownloadBAM(
      'https://example.com/sample.bam',
      '/tmp/regions.bed',
      '/output/sample.region.bam',
      '/output/sample.bam.bai',
      mockLogger,
      mockMetrics,
      false,
      false,
    );

    expect(spawn).toHaveBeenCalledWith('samtools', [
      'view',
      '-b',
      '-X',
      'https://example.com/sample.bam',
      '/output/sample.bam.bai',
      '-L',
      '/tmp/regions.bed',
      '-M',
      '-o',
      '/output/sample.region.bam',
    ]);
  });

  test('should include multiple regions with wildcard when includeUnmapped is true', async () => {
    fs.existsSync.mockReturnValue(false);

    const mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
    };
    spawn.mockReturnValue(mockProcess);

    setImmediate(() => {
      const closeCallback = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'close',
      )?.[1];
      if (closeCallback) closeCallback(0);
    });

    await rangedDownloadBAM(
      'https://example.com/sample.bam',
      '/tmp/regions.bed',
      '/output/sample.region.bam',
      '/output/sample.bam.bai',
      mockLogger,
      mockMetrics,
      false,
      true,
      ['chr1:1000-2000', 'chr2:3000-4000'],
    );

    expect(spawn).toHaveBeenCalledWith('samtools', [
      'view',
      '-b',
      '-X',
      'https://example.com/sample.bam',
      '/output/sample.bam.bai',
      'chr1:1000-2000',
      'chr2:3000-4000',
      '*',
      '-o',
      '/output/sample.region.bam',
    ]);
  });
});

describe('generateOutputFileName with unmapped suffix', () => {
  let mockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  test('should generate correct filename for unmapped BAM files', () => {
    const result = generateOutputFileName(
      'sample_001.bam',
      ['unmapped'],
      mockLogger,
    );
    expect(result).toBe('sample_001.unmapped.bam');
  });

  test('should generate correct filename for unmapped BAM index files', () => {
    const result = generateOutputFileName(
      'sample_001.bam.bai',
      ['unmapped'],
      mockLogger,
    );
    expect(result).toBe('sample_001.unmapped.bam.bai');
  });
});
