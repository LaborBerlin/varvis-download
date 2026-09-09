const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { createMockLogger } = require('../helpers/mockFactories');

const mockProxyClose = jest.fn().mockResolvedValue();
const mockCreateBoundedRangeProxy = jest
  .fn()
  .mockImplementation(async (targetUrl, options) => {
    return {
      proxyUrl: `http://127.0.0.1:54321/stream/mock-token`,
      token: 'mock-token',
      close: mockProxyClose,
      getMetrics: jest.fn(() => ({
        totalBytesServed: 0,
        totalChunksFetched: 0,
      })),
    };
  });

jest.mock('../../js/net/boundedRangeProxy.cjs', () => ({
  createBoundedRangeProxy: (...args) => mockCreateBoundedRangeProxy(...args),
}));

jest.mock('node:child_process');
jest.mock('node:fs');

const {
  rangedDownloadBAM,
  unmappedDownloadBAM,
  rangedDownloadVCF,
} = require('../../js/rangedUtils.cjs');

describe('rangedUtils proxy integration', () => {
  let mockLogger;
  let mockMetrics;

  const createMockProcess = (exitCode = 0) => ({
    stdout: {
      on: jest.fn(),
      pipe: jest.fn(),
    },
    stderr: {
      on: jest.fn(),
    },
    stdin: {},
    on: jest.fn((event, cb) => {
      if (event === 'close') {
        setTimeout(() => cb(exitCode), 0);
      }
    }),
  });

  const createMockOutputStream = () => ({
    on: jest.fn((event, cb) => {
      if (event === 'finish') {
        setTimeout(() => cb(), 0);
      }
    }),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = createMockLogger();
    mockMetrics = {
      totalFilesDownloaded: 0,
      totalFilesSkipped: 0,
    };
    fs.existsSync.mockReturnValue(false);
    fs.unlinkSync.mockImplementation(() => {});
  });

  describe('rangedDownloadBAM', () => {
    const rawUrl = 'https://s3.example.com/data.bam';
    const bedFile = '/tmp/regions.bed';
    const outputFile = '/tmp/output.bam';
    const indexFile = '/tmp/data.bam.bai';

    test('enables proxy by default, passes proxyUrl to samtools, and closes proxy on success', async () => {
      spawn.mockReturnValue(createMockProcess(0));

      await rangedDownloadBAM(
        rawUrl,
        bedFile,
        outputFile,
        indexFile,
        mockLogger,
        mockMetrics,
      );

      expect(mockCreateBoundedRangeProxy).toHaveBeenCalledTimes(1);
      expect(mockCreateBoundedRangeProxy).toHaveBeenCalledWith(rawUrl, {
        chunkSize: undefined,
        logger: mockLogger,
      });

      expect(spawn).toHaveBeenCalledTimes(1);
      const spawnArgs = spawn.mock.calls[0][1];
      expect(spawnArgs).toContain('http://127.0.0.1:54321/stream/mock-token');
      expect(spawnArgs).not.toContain(rawUrl);

      expect(mockProxyClose).toHaveBeenCalledTimes(1);
      expect(mockMetrics.totalFilesDownloaded).toBe(1);
    });

    test('forwards custom chunkSize to createBoundedRangeProxy', async () => {
      spawn.mockReturnValue(createMockProcess(0));

      await rangedDownloadBAM(
        rawUrl,
        bedFile,
        outputFile,
        indexFile,
        mockLogger,
        mockMetrics,
        false,
        false,
        [],
        { enabled: true, chunkSize: 4194304 },
      );

      expect(mockCreateBoundedRangeProxy).toHaveBeenCalledWith(rawUrl, {
        chunkSize: 4194304,
        logger: mockLogger,
      });
      expect(mockProxyClose).toHaveBeenCalledTimes(1);
    });

    test('closes proxy even if samtools fails', async () => {
      spawn.mockReturnValue(createMockProcess(1));

      await expect(
        rangedDownloadBAM(
          rawUrl,
          bedFile,
          outputFile,
          indexFile,
          mockLogger,
          mockMetrics,
        ),
      ).rejects.toThrow('Process samtools exited with code 1');

      expect(mockCreateBoundedRangeProxy).toHaveBeenCalledTimes(1);
      expect(mockProxyClose).toHaveBeenCalledTimes(1);
    });

    test('bypasses proxy when proxyOptions.enabled is false', async () => {
      spawn.mockReturnValue(createMockProcess(0));

      await rangedDownloadBAM(
        rawUrl,
        bedFile,
        outputFile,
        indexFile,
        mockLogger,
        mockMetrics,
        false,
        false,
        [],
        { enabled: false },
      );

      expect(mockCreateBoundedRangeProxy).not.toHaveBeenCalled();
      expect(mockProxyClose).not.toHaveBeenCalled();

      const spawnArgs = spawn.mock.calls[0][1];
      expect(spawnArgs).toContain(rawUrl);
      expect(spawnArgs).not.toContain(
        'http://127.0.0.1:54321/stream/mock-token',
      );
    });
  });

  describe('unmappedDownloadBAM', () => {
    const rawUrl = 'https://s3.example.com/unmapped.bam';
    const outputFile = '/tmp/unmapped.bam';
    const indexFile = '/tmp/unmapped.bam.bai';

    test('enables proxy by default, passes proxyUrl to samtools, and closes proxy on success', async () => {
      spawn.mockReturnValue(createMockProcess(0));

      await unmappedDownloadBAM(
        rawUrl,
        outputFile,
        indexFile,
        mockLogger,
        mockMetrics,
      );

      expect(mockCreateBoundedRangeProxy).toHaveBeenCalledTimes(1);
      expect(mockCreateBoundedRangeProxy).toHaveBeenCalledWith(rawUrl, {
        chunkSize: undefined,
        logger: mockLogger,
      });

      const spawnArgs = spawn.mock.calls[0][1];
      expect(spawnArgs).toContain('http://127.0.0.1:54321/stream/mock-token');
      expect(spawnArgs).not.toContain(rawUrl);

      expect(mockProxyClose).toHaveBeenCalledTimes(1);
      expect(mockMetrics.totalFilesDownloaded).toBe(1);
    });

    test('closes proxy even if unmapped extraction fails', async () => {
      spawn.mockReturnValue(createMockProcess(1));

      await expect(
        unmappedDownloadBAM(
          rawUrl,
          outputFile,
          indexFile,
          mockLogger,
          mockMetrics,
        ),
      ).rejects.toThrow('Process samtools exited with code 1');

      expect(mockCreateBoundedRangeProxy).toHaveBeenCalledTimes(1);
      expect(mockProxyClose).toHaveBeenCalledTimes(1);
    });

    test('bypasses proxy when proxyOptions.enabled is false', async () => {
      spawn.mockReturnValue(createMockProcess(0));

      await unmappedDownloadBAM(
        rawUrl,
        outputFile,
        indexFile,
        mockLogger,
        mockMetrics,
        false,
        { enabled: false },
      );

      expect(mockCreateBoundedRangeProxy).not.toHaveBeenCalled();
      expect(mockProxyClose).not.toHaveBeenCalled();

      const spawnArgs = spawn.mock.calls[0][1];
      expect(spawnArgs).toContain(rawUrl);
    });
  });

  describe('rangedDownloadVCF', () => {
    const rawUrl = 'https://s3.example.com/data.vcf.gz';
    const range = 'chr1:1000-2000';
    const outputFile = '/tmp/output.vcf.gz';
    const indexFile = '/tmp/data.vcf.gz.tbi';

    test('spawns tabix with proxy URL and closes proxy upon completion', async () => {
      const tabixProc = createMockProcess(0);
      const bgzipProc = createMockProcess(0);
      spawn.mockReturnValueOnce(tabixProc).mockReturnValueOnce(bgzipProc);
      fs.createWriteStream.mockReturnValue(createMockOutputStream());

      await rangedDownloadVCF(
        rawUrl,
        range,
        outputFile,
        indexFile,
        mockLogger,
        mockMetrics,
      );

      expect(mockCreateBoundedRangeProxy).toHaveBeenCalledTimes(1);
      expect(mockCreateBoundedRangeProxy).toHaveBeenCalledWith(rawUrl, {
        chunkSize: undefined,
        logger: mockLogger,
      });

      expect(spawn).toHaveBeenCalledWith(
        'tabix',
        ['-h', 'http://127.0.0.1:54321/stream/mock-token', range],
        { cwd: '/tmp' },
      );

      expect(mockProxyClose).toHaveBeenCalledTimes(1);
      expect(mockMetrics.totalFilesDownloaded).toBe(1);
    });

    test('closes proxy when tabix or bgzip pipeline fails', async () => {
      const tabixProc = createMockProcess(0);
      const bgzipProc = createMockProcess(1);
      spawn.mockReturnValueOnce(tabixProc).mockReturnValueOnce(bgzipProc);
      fs.createWriteStream.mockReturnValue(createMockOutputStream());

      await expect(
        rangedDownloadVCF(
          rawUrl,
          range,
          outputFile,
          indexFile,
          mockLogger,
          mockMetrics,
        ),
      ).rejects.toThrow('bgzip process exited with code 1');

      expect(mockCreateBoundedRangeProxy).toHaveBeenCalledTimes(1);
      expect(mockProxyClose).toHaveBeenCalledTimes(1);
    });

    test('bypasses proxy when proxyOptions.enabled is false', async () => {
      const tabixProc = createMockProcess(0);
      const bgzipProc = createMockProcess(0);
      spawn.mockReturnValueOnce(tabixProc).mockReturnValueOnce(bgzipProc);
      fs.createWriteStream.mockReturnValue(createMockOutputStream());

      await rangedDownloadVCF(
        rawUrl,
        range,
        outputFile,
        indexFile,
        mockLogger,
        mockMetrics,
        false,
        { enabled: false },
      );

      expect(mockCreateBoundedRangeProxy).not.toHaveBeenCalled();
      expect(mockProxyClose).not.toHaveBeenCalled();

      expect(spawn).toHaveBeenCalledWith('tabix', ['-h', rawUrl, range], {
        cwd: '/tmp',
      });
    });
  });
});
