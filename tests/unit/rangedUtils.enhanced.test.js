/* global setImmediate */
const {
  checkToolAvailability,
  generateOutputFileName,
  ensureIndexFile,
  rangedDownloadBAM,
  indexBAM,
  indexVCF,
} = require('../../js/rangedUtils.cjs');
const { createMockLogger } = require('../helpers/mockFactories');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { downloadFile } = require('../../js/fileUtils.cjs');

jest.mock('node:child_process');
jest.mock('node:fs');
jest.mock('../../js/fileUtils.cjs');

describe('rangedUtils (enhanced)', () => {
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

  describe('generateOutputFileName', () => {
    test('should return original filename when no regions provided', () => {
      const result = generateOutputFileName('sample.vcf.gz', null, mockLogger);
      expect(result).toBe('sample.vcf.gz');

      const result2 = generateOutputFileName('sample.vcf.gz', [], mockLogger);
      expect(result2).toBe('sample.vcf.gz');

      const result3 = generateOutputFileName('sample.vcf.gz', [''], mockLogger);
      expect(result3).toBe('sample.vcf.gz');
    });

    test('should append single region to filename for VCF.gz', () => {
      const result = generateOutputFileName(
        'sample.vcf.gz',
        ['chr1:1000-2000'],
        mockLogger,
      );
      expect(result).toBe('sample.chr1_1000_2000.vcf.gz');
    });

    test('should append single region to filename for BAM', () => {
      const result = generateOutputFileName(
        'sample.bam',
        ['chr2:5000-10000'],
        mockLogger,
      );
      expect(result).toBe('sample.chr2_5000_10000.bam');
    });

    test('should append multiple-regions suffix for multiple regions', () => {
      const result = generateOutputFileName(
        'sample.vcf.gz',
        ['chr1:1000-2000', 'chr2:3000-4000'],
        mockLogger,
      );
      expect(result).toBe('sample.multiple-regions.vcf.gz');
    });

    test('should handle VCF.gz.tbi extension', () => {
      const result = generateOutputFileName(
        'sample.vcf.gz.tbi',
        ['chr1:1000-2000'],
        mockLogger,
      );
      expect(result).toBe('sample.chr1_1000_2000.vcf.gz.tbi');
    });

    test('should handle BAM.bai extension', () => {
      const result = generateOutputFileName(
        'sample.bam.bai',
        ['chr1:1000-2000'],
        mockLogger,
      );
      expect(result).toBe('sample.chr1_1000_2000.bam.bai');
    });

    test('should sanitize region special characters', () => {
      const result = generateOutputFileName(
        'sample.vcf.gz',
        ['chr1:1000-2000'],
        mockLogger,
      );
      expect(result).not.toContain(':');
      expect(result).not.toContain('-');
      expect(result).toContain('_');
    });
  });

  describe('ensureIndexFile', () => {
    const mockAgent = { name: 'mockAgent' };
    const mockRl = { question: jest.fn() };

    test('should skip download when index file already exists', async () => {
      fs.existsSync.mockReturnValue(true);

      await ensureIndexFile(
        'https://example.com/sample.bam',
        'https://example.com/sample.bam.bai',
        '/path/to/sample.bam.bai',
        mockAgent,
        mockRl,
        mockLogger,
        mockMetrics,
        false,
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Index file already exists: /path/to/sample.bam.bai',
      );
      expect(downloadFile).not.toHaveBeenCalled();
    });

    test('should download index file when it does not exist', async () => {
      fs.existsSync.mockReturnValue(false);
      downloadFile.mockResolvedValue();

      await ensureIndexFile(
        'https://example.com/sample.bam',
        'https://example.com/sample.bam.bai',
        '/path/to/sample.bam.bai',
        mockAgent,
        mockRl,
        mockLogger,
        mockMetrics,
        false,
      );

      expect(downloadFile).toHaveBeenCalledWith(
        'https://example.com/sample.bam.bai',
        '/path/to/sample.bam.bai',
        false,
        mockAgent,
        mockRl,
        mockLogger,
        mockMetrics,
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Downloaded index file to /path/to/sample.bam.bai',
      );
    });

    test('should handle download error and rethrow', async () => {
      fs.existsSync.mockReturnValue(false);
      const mockError = new Error('Download failed');
      downloadFile.mockRejectedValue(mockError);

      await expect(
        ensureIndexFile(
          'https://example.com/sample.bam',
          'https://example.com/sample.bam.bai',
          '/path/to/sample.bam.bai',
          mockAgent,
          mockRl,
          mockLogger,
          mockMetrics,
          false,
        ),
      ).rejects.toThrow('Download failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error downloading index file: Download failed',
      );
    });
  });

  describe('rangedDownloadBAM', () => {
    test('should skip download when file exists and overwrite is false', async () => {
      fs.existsSync.mockReturnValue(true);

      await rangedDownloadBAM(
        'https://example.com/sample.bam',
        '/path/to/regions.bed',
        '/path/to/output.bam',
        '/path/to/sample.bam.bai',
        mockLogger,
        mockMetrics,
        false,
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'BAM file already exists: /path/to/output.bam, skipping download.',
      );
      expect(mockMetrics.totalFilesSkipped).toBe(1);
      expect(spawn).not.toHaveBeenCalled();
    });

    test('should perform download when file does not exist', async () => {
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
        if (closeCallback) {
          closeCallback(0);
        }
      });

      await rangedDownloadBAM(
        'https://example.com/sample.bam',
        '/path/to/regions.bed',
        '/path/to/output.bam',
        '/path/to/sample.bam.bai',
        mockLogger,
        mockMetrics,
        false,
      );

      expect(spawn).toHaveBeenCalledWith('samtools', [
        'view',
        '-b',
        '-X',
        'https://example.com/sample.bam',
        '/path/to/sample.bam.bai',
        '-L',
        '/path/to/regions.bed',
        '-M',
        '-o',
        '/path/to/output.bam',
      ]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Downloaded BAM file for regions in BED file to /path/to/output.bam',
      );
      expect(mockMetrics.totalFilesDownloaded).toBe(1);
    });

    test('should handle samtools error and rethrow', async () => {
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
        if (closeCallback) {
          closeCallback(1); // Non-zero exit code
        }
      });

      await expect(
        rangedDownloadBAM(
          'https://example.com/sample.bam',
          '/path/to/regions.bed',
          '/path/to/output.bam',
          '/path/to/sample.bam.bai',
          mockLogger,
          mockMetrics,
          false,
        ),
      ).rejects.toThrow('Process samtools exited with code 1');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error performing ranged download for BAM'),
      );
    });
  });

  describe('indexBAM', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(false);
    });

    test('should skip indexing when index file exists and overwrite is false', async () => {
      fs.existsSync.mockReturnValue(true);

      await indexBAM('/path/to/sample.bam', mockLogger, false);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Index file already exists: /path/to/sample.bam.bai, skipping indexing.',
      );
      expect(spawn).not.toHaveBeenCalled();
    });

    test('should index BAM file when index does not exist', async () => {
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
        if (closeCallback) {
          closeCallback(0);
        }
      });

      await indexBAM('/path/to/sample.bam', mockLogger);

      expect(spawn).toHaveBeenCalledWith('samtools', [
        'index',
        '/path/to/sample.bam',
      ]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Indexing BAM file: /path/to/sample.bam',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Indexed BAM file: /path/to/sample.bam',
      );
    });

    test('should index BAM file when overwrite is true', async () => {
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
        if (closeCallback) {
          closeCallback(0);
        }
      });

      await indexBAM('/path/to/sample.bam', mockLogger, true);

      expect(spawn).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Indexed BAM file: /path/to/sample.bam',
      );
    });

    test('should handle indexing error', async () => {
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
        if (closeCallback) {
          closeCallback(1);
        }
      });

      await expect(
        indexBAM('/path/to/sample.bam', mockLogger),
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error indexing BAM file'),
      );
    });
  });

  describe('indexVCF', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(false);
    });

    test('should skip indexing when index file exists and overwrite is false', async () => {
      fs.existsSync.mockReturnValue(true);

      await indexVCF('/path/to/sample.vcf.gz', mockLogger, false);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Index file already exists: /path/to/sample.vcf.gz.tbi, skipping indexing.',
      );
      expect(spawn).not.toHaveBeenCalled();
    });

    test('should index VCF.gz file when index does not exist', async () => {
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
        if (closeCallback) {
          closeCallback(0);
        }
      });

      await indexVCF('/path/to/sample.vcf.gz', mockLogger);

      expect(spawn).toHaveBeenCalledWith('tabix', [
        '-p',
        'vcf',
        '/path/to/sample.vcf.gz',
      ]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Indexing VCF.gz file: /path/to/sample.vcf.gz',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Indexed VCF.gz file: /path/to/sample.vcf.gz',
      );
    });

    test('should index VCF.gz file when overwrite is true', async () => {
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
        if (closeCallback) {
          closeCallback(0);
        }
      });

      await indexVCF('/path/to/sample.vcf.gz', mockLogger, true);

      expect(spawn).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Indexed VCF.gz file: /path/to/sample.vcf.gz',
      );
    });

    test('should handle indexing error', async () => {
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
        if (closeCallback) {
          closeCallback(1);
        }
      });

      await expect(
        indexVCF('/path/to/sample.vcf.gz', mockLogger),
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error indexing VCF.gz file'),
      );
    });
  });
});
