const fileUtils = require('../../js/fileUtils.cjs');
const { downloadFile } = fileUtils;
const {
  createMockLogger,
  createMockReadline,
} = require('../helpers/mockFactories');
const { TestDirectory } = require('../helpers/testUtils');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { Writable } = require('node:stream');

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

  describe('confirmOverwrite export', () => {
    test('is removed as dead code (#154)', () => {
      expect(fileUtils.confirmOverwrite).toBeUndefined();
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

    const runDownload = (
      outPath,
      ow = true,
      url = 'https://example.com/file.txt',
    ) =>
      downloadFile(
        url,
        outPath,
        ow,
        mockAgent,
        mockRl,
        mockLogger,
        mockMetrics,
      );

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
        {
          method: 'GET',
          dispatcher: mockAgent,
          timeout: 0,
          signal: expect.any(AbortSignal),
        },
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

    test('should reject when response has no body', async () => {
      const dir = await testDir.create(`download-no-body-${Date.now()}`);
      const outputPath = path.join(dir, 'file.txt');

      fetchWithRetry.mockResolvedValue({
        body: null,
        headers: {
          get: () => '0',
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
      ).rejects.toThrow(
        'Download response for https://example.com/file.txt did not include a body',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('did not include a body'),
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

    test('should write to .part file and atomically rename on successful download', async () => {
      const dir = await testDir.create(`download-atomic-${Date.now()}`);
      const outputPath = path.join(dir, 'file.txt');
      const partPath = `${outputPath}.${process.pid}.part`;
      const createWriteStreamSpy = jest.spyOn(fs, 'createWriteStream');

      let partExistedDuringStream = false;
      let outputExistedDuringStream = false;

      const mockBody = {
        async *[Symbol.asyncIterator]() {
          const writer = createWriteStreamSpy.mock.results[0].value;
          if (writer.pending) {
            await once(writer, 'open');
          }
          partExistedDuringStream = fs.existsSync(partPath);
          outputExistedDuringStream = fs.existsSync(outputPath);
          yield Buffer.from('downloaded content');
        },
      };

      fetchWithRetry.mockResolvedValue({
        body: mockBody,
        headers: { get: () => '18' },
      });

      try {
        await runDownload(outputPath);
      } finally {
        createWriteStreamSpy.mockRestore();
      }

      expect(partExistedDuringStream).toBe(true);
      expect(outputExistedDuringStream).toBe(false);
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.readFileSync(outputPath, 'utf8')).toBe('downloaded content');
      expect(fs.existsSync(partPath)).toBe(false);
    });

    test('should leave existing file untouched and clean up .part file when download fails', async () => {
      const dir = await testDir.create(`download-fail-atomic-${Date.now()}`);
      const outputPath = path.join(dir, 'file.txt');
      const partPath = `${outputPath}.${process.pid}.part`;
      fs.writeFileSync(outputPath, 'original content');

      const mockError = new Error('Download interrupted mid-stream');
      const mockBody = {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from('partial chunk');
          throw mockError;
        },
      };

      fetchWithRetry.mockResolvedValue({
        body: mockBody,
        headers: { get: () => '1024' },
      });

      await expect(runDownload(outputPath)).rejects.toThrow(
        'Download interrupted mid-stream',
      );

      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.readFileSync(outputPath, 'utf8')).toBe('original content');
      expect(fs.existsSync(partPath)).toBe(false);
    });

    test('awaits drain when the writable applies backpressure', async () => {
      const dir = await testDir.create(`download-backpressure-${Date.now()}`);
      const outputPath = path.join(dir, 'file.bin');

      const order = [];
      const slowWriter = new Writable({
        highWaterMark: 1,
        write(chunk, _enc, cb) {
          order.push(`write:${chunk.toString()}`);
          setTimeout(cb, 0);
        },
      });
      const spy = jest
        .spyOn(fs, 'createWriteStream')
        .mockReturnValue(slowWriter);
      const renameSpy = jest
        .spyOn(fs, 'renameSync')
        .mockImplementation(() => {});

      const chunks = ['a', 'b', 'c'];
      const mockBody = {
        async *[Symbol.asyncIterator]() {
          for (const c of chunks) {
            order.push(`pull:${c}`);
            yield Buffer.from(c);
          }
        },
      };
      fetchWithRetry.mockResolvedValue({
        body: mockBody,
        headers: { get: () => '3' },
      });

      try {
        await runDownload(outputPath, true, 'https://example.com/file.bin');
      } finally {
        spy.mockRestore();
        renameSpy.mockRestore();
      }

      // Backpressure honored => pulls and writes strictly interleave 1:1.
      expect(order).toEqual([
        'pull:a',
        'write:a',
        'pull:b',
        'write:b',
        'pull:c',
        'write:c',
      ]);
      expect(mockMetrics.totalBytesDownloaded).toBe(3);
    });
  });
});
