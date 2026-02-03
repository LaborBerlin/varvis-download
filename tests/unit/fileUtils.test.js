const { confirmOverwrite, downloadFile } = require('../../js/fileUtils.cjs');
const {
  createMockLogger,
  createMockReadline,
} = require('../helpers/mockFactories');
const { TestDirectory } = require('../helpers/testUtils');
const fs = require('node:fs');
const path = require('node:path');

jest.mock('../../js/apiClient.cjs');
jest.mock('progress');

const { fetchWithRetry } = require('../../js/apiClient.cjs');
const ProgressBar = require('progress');

describe('fileUtils', () => {
  let mockLogger;
  let testDir;

  beforeEach(() => {
    mockLogger = createMockLogger();
    testDir = new TestDirectory();
  });

  afterEach(async () => {
    await testDir.cleanup();
  });

  describe('confirmOverwrite', () => {
    test('should return true when user answers y', async () => {
      const mockRl = createMockReadline({
        'File test.txt already exists. Overwrite? (y/n): ': 'y',
      });

      const result = await confirmOverwrite('test.txt', mockRl, mockLogger);

      expect(result).toBe(true);
      expect(mockRl.question).toHaveBeenCalledWith(
        'File test.txt already exists. Overwrite? (y/n): ',
        expect.any(Function),
      );
    });

    test('should return true when user answers Y (uppercase)', async () => {
      const mockRl = createMockReadline({
        'File test.txt already exists. Overwrite? (y/n): ': 'Y',
      });

      const result = await confirmOverwrite('test.txt', mockRl, mockLogger);

      expect(result).toBe(true);
    });

    test('should return false when user answers n', async () => {
      const mockRl = createMockReadline({
        'File test.txt already exists. Overwrite? (y/n): ': 'n',
      });

      const result = await confirmOverwrite('test.txt', mockRl, mockLogger);

      expect(result).toBe(false);
    });

    test('should return false when user answers N (uppercase)', async () => {
      const mockRl = createMockReadline({
        'File test.txt already exists. Overwrite? (y/n): ': 'N',
      });

      const result = await confirmOverwrite('test.txt', mockRl, mockLogger);

      expect(result).toBe(false);
    });

    test('should return false for any answer other than y/Y', async () => {
      const mockRl = createMockReadline({
        'File test.txt already exists. Overwrite? (y/n): ': 'maybe',
      });

      const result = await confirmOverwrite('test.txt', mockRl, mockLogger);

      expect(result).toBe(false);
    });

    test('should handle different file paths', async () => {
      const mockRl = createMockReadline({
        'File /path/to/file.bam already exists. Overwrite? (y/n): ': 'y',
      });

      const result = await confirmOverwrite(
        '/path/to/file.bam',
        mockRl,
        mockLogger,
      );

      expect(result).toBe(true);
      expect(mockRl.question).toHaveBeenCalledWith(
        'File /path/to/file.bam already exists. Overwrite? (y/n): ',
        expect.any(Function),
      );
    });
  });

  describe('downloadFile', () => {
    let mockAgent;
    let mockRl;
    let mockMetrics;
    let mockProgressBar;

    beforeEach(() => {
      mockAgent = { name: 'mockAgent' };
      mockRl = createMockReadline({});
      mockMetrics = {
        totalFilesDownloaded: 0,
        totalFilesSkipped: 0,
        totalBytesDownloaded: 0,
        downloadSpeeds: [],
      };

      mockProgressBar = {
        tick: jest.fn(),
        update: jest.fn(),
        terminate: jest.fn(),
      };
      ProgressBar.mockImplementation(() => mockProgressBar);

      jest.clearAllMocks();
    });

    test('should skip download when file exists and overwrite is false', async () => {
      const dir = await testDir.create(`download-skip-${Date.now()}`);
      const outputPath = path.join(dir, 'existing-file.txt');
      fs.writeFileSync(outputPath, 'existing content');

      await downloadFile(
        'https://example.com/file.txt',
        outputPath,
        false,
        mockAgent,
        mockRl,
        mockLogger,
        mockMetrics,
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        `File already exists, skipping: ${outputPath}`,
      );
      expect(mockMetrics.totalFilesSkipped).toBe(1);
      expect(fetchWithRetry).not.toHaveBeenCalled();
    });

    test('should proceed with download when overwrite is true', async () => {
      const dir = await testDir.create(`download-overwrite-${Date.now()}`);
      const outputPath = path.join(dir, 'file.txt');
      fs.writeFileSync(outputPath, 'old content');

      const mockBody = {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from('new content');
        },
      };

      fetchWithRetry.mockResolvedValue({
        body: mockBody,
        headers: {
          get: () => '11',
        },
      });

      await downloadFile(
        'https://example.com/file.txt',
        outputPath,
        true,
        mockAgent,
        mockRl,
        mockLogger,
        mockMetrics,
      );

      expect(fetchWithRetry).toHaveBeenCalledWith(
        'https://example.com/file.txt',
        { method: 'GET', dispatcher: mockAgent },
        3,
        mockLogger,
      );
      expect(mockMetrics.totalFilesDownloaded).toBe(1);
    });

    test('should create progress bar with correct options', async () => {
      const dir = await testDir.create(`download-progress-${Date.now()}`);
      const outputPath = path.join(dir, 'file.txt');

      const mockBody = {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from('test');
        },
      };

      fetchWithRetry.mockResolvedValue({
        body: mockBody,
        headers: {
          get: () => '1024',
        },
      });

      await downloadFile(
        'https://example.com/file.txt',
        outputPath,
        true,
        mockAgent,
        mockRl,
        mockLogger,
        mockMetrics,
      );

      expect(ProgressBar).toHaveBeenCalledWith(
        '  downloading [:bar] :rate/bps :percent :etas',
        {
          complete: '=',
          incomplete: ' ',
          width: 20,
          total: 1024,
        },
      );
    });

    test('should update metrics after successful download', async () => {
      const dir = await testDir.create(`download-metrics-${Date.now()}`);
      const outputPath = path.join(dir, 'file.txt');

      const testContent = Buffer.from('test content');
      const mockBody = {
        async *[Symbol.asyncIterator]() {
          yield testContent;
        },
      };

      fetchWithRetry.mockResolvedValue({
        body: mockBody,
        headers: {
          get: () => testContent.length.toString(),
        },
      });

      await downloadFile(
        'https://example.com/file.txt',
        outputPath,
        true,
        mockAgent,
        mockRl,
        mockLogger,
        mockMetrics,
      );

      expect(mockMetrics.totalFilesDownloaded).toBe(1);
      expect(mockMetrics.totalBytesDownloaded).toBe(testContent.length);
      expect(mockMetrics.downloadSpeeds.length).toBe(1);
      expect(mockMetrics.downloadSpeeds[0]).toBeGreaterThan(0);
    });

    test('should log error and rethrow when download fails', async () => {
      const dir = await testDir.create(`download-error-${Date.now()}`);
      const outputPath = path.join(dir, 'file.txt');

      const mockError = new Error('Network interrupted');
      const mockBody = {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from('partial');
          throw mockError;
        },
      };

      fetchWithRetry.mockResolvedValue({
        body: mockBody,
        headers: {
          get: () => '1024',
        },
      });

      await expect(
        downloadFile(
          'https://example.com/file.txt',
          outputPath,
          true,
          mockAgent,
          mockRl,
          mockLogger,
          mockMetrics,
        ),
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Download interrupted'),
      );
    });

    test('should log debug message at start of download', async () => {
      const dir = await testDir.create(`download-debug-${Date.now()}`);
      const outputPath = path.join(dir, 'file.txt');

      const mockBody = {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from('test');
        },
      };

      fetchWithRetry.mockResolvedValue({
        body: mockBody,
        headers: {
          get: () => '4',
        },
      });

      await downloadFile(
        'https://example.com/file.txt',
        outputPath,
        true,
        mockAgent,
        mockRl,
        mockLogger,
        mockMetrics,
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Starting download for: https://example.com/file.txt',
      );
    });
  });
});
