const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { downloadFile } = require('../../js/fileUtils.cjs');
const { createMockLogger } = require('../helpers/mockFactories');
const { fetchWithRetry } = require('../../js/apiClient.cjs');

jest.mock('../../js/apiClient.cjs');
jest.mock('progress');

describe('fileUtils atomicReplace (#155)', () => {
  let mockLogger;
  let testDir;
  let metrics;

  beforeEach(() => {
    mockLogger = createMockLogger();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'varvis-atomic-test-'));
    metrics = {
      startTime: Date.now(),
      totalFilesDownloaded: 0,
      totalFilesSkipped: 0,
      totalFilesFailed: 0,
      totalBytesDownloaded: 0,
      downloadSpeeds: [],
    };
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
  });

  function createAsyncIterable(chunks) {
    return {
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) {
          yield Buffer.from(chunk);
        }
      },
    };
  }

  test('restores original destination and preserves .part file when rename throws on overwrite', async () => {
    const outputPath = path.join(testDir, 'sample.bam');
    const originalContent = 'ORIGINAL_DIAGNOSTIC_BAM_CONTENT';
    fs.writeFileSync(outputPath, originalContent);

    const newContent = 'NEW_COMPLETED_BAM_CONTENT';
    fetchWithRetry.mockResolvedValueOnce({
      headers: { get: () => String(newContent.length) },
      body: createAsyncIterable([newContent]),
    });

    const realRenameSync = fs.renameSync;
    let renameAttempts = 0;
    jest.spyOn(fs, 'renameSync').mockImplementation((src, dest) => {
      renameAttempts++;
      // First rename is staging: outputPath -> backupPath
      if (renameAttempts === 1) {
        return realRenameSync(src, dest);
      }
      // Second rename is commit: partPath -> outputPath. Simulate EPERM/failure
      if (renameAttempts === 2) {
        const error = new Error('EPERM: operation not permitted');
        /** @type {any} */ (error).code = 'EPERM';
        throw error;
      }
      // Third rename is rollback: backupPath -> outputPath
      return realRenameSync(src, dest);
    });

    await expect(
      downloadFile(
        'https://example.test/sample.bam',
        outputPath,
        true,
        {},
        null,
        mockLogger,
        metrics,
      ),
    ).rejects.toThrow('EPERM');

    // Verify original file was restored
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.readFileSync(outputPath, 'utf8')).toBe(originalContent);

    // Verify .part file was preserved for recovery
    const partFiles = fs
      .readdirSync(testDir)
      .filter((f) => f.endsWith('.part'));
    expect(partFiles.length).toBe(1);
    expect(fs.readFileSync(path.join(testDir, partFiles[0]), 'utf8')).toBe(
      newContent,
    );
  });

  test('successfully cleans up backup and updates destination on successful overwrite', async () => {
    const outputPath = path.join(testDir, 'sample.bam');
    const originalContent = 'OLD_CONTENT';
    fs.writeFileSync(outputPath, originalContent);

    const newContent = 'NEW_VERIFIED_CONTENT';
    fetchWithRetry.mockResolvedValueOnce({
      headers: { get: () => String(newContent.length) },
      body: createAsyncIterable([newContent]),
    });

    await downloadFile(
      'https://example.test/sample.bam',
      outputPath,
      true,
      {},
      null,
      mockLogger,
      metrics,
    );

    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.readFileSync(outputPath, 'utf8')).toBe(newContent);

    // No leftover .part or .bak files
    const remaining = fs.readdirSync(testDir);
    expect(remaining).toEqual(['sample.bam']);
    expect(metrics.totalFilesDownloaded).toBe(1);
  });

  test('cleans up incomplete .part file when network transfer fails mid-flight', async () => {
    const outputPath = path.join(testDir, 'sample.bam');

    fetchWithRetry.mockResolvedValueOnce({
      headers: { get: () => '1000' },
      body: {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from('partial chunk');
          throw new Error('Network dropped connection');
        },
      },
    });

    await expect(
      downloadFile(
        'https://example.test/sample.bam',
        outputPath,
        true,
        {},
        null,
        mockLogger,
        metrics,
      ),
    ).rejects.toThrow('Network dropped connection');

    const partFiles = fs
      .readdirSync(testDir)
      .filter((f) => f.endsWith('.part'));
    expect(partFiles.length).toBe(0);
  });

  test('throws EISDIR and does not replace when outputPath is an existing directory (#155)', async () => {
    const dirPath = path.join(testDir, 'sample_dir.bam');
    fs.mkdirSync(dirPath);

    await expect(
      downloadFile(
        'https://example.test/sample.bam',
        dirPath,
        true,
        {},
        null,
        mockLogger,
        metrics,
      ),
    ).rejects.toThrow('EISDIR');

    expect(fs.existsSync(dirPath)).toBe(true);
    expect(fs.statSync(dirPath).isDirectory()).toBe(true);
  });

  test('aborts fetch immediately when writer encounters an early error (#155)', async () => {
    const outputPath = path.join(testDir, 'sample.bam');
    /** @type {AbortSignal|undefined} */
    let fetchSignal;

    fetchWithRetry.mockImplementationOnce((_url, options) => {
      fetchSignal = options.signal;
      return new Promise((_resolve, reject) => {
        if (fetchSignal?.aborted) {
          reject(fetchSignal.reason);
        } else {
          fetchSignal?.addEventListener('abort', () =>
            reject(fetchSignal.reason),
          );
        }
      });
    });

    const origCreateWriteStream = fs.createWriteStream.bind(fs);
    jest.spyOn(fs, 'createWriteStream').mockImplementationOnce((p, opts) => {
      const realStream = origCreateWriteStream(p, opts);
      setTimeout(() => {
        realStream.destroy(
          Object.assign(new Error('EACCES: permission denied'), {
            code: 'EACCES',
          }),
        );
      }, 0);
      return realStream;
    });

    await expect(
      downloadFile(
        'https://example.test/sample.bam',
        outputPath,
        true,
        {},
        null,
        mockLogger,
        metrics,
      ),
    ).rejects.toThrow('EACCES');

    expect(fetchSignal?.aborted).toBe(true);
  });
});
