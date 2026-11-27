const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

jest.mock('../../../js/range/sparseMirror.cjs', () => ({
  buildSparseMirror: jest.fn(),
  removeSparseMirror: jest.fn(async () => {}),
}));

const {
  buildSparseMirror,
  removeSparseMirror,
} = require('../../../js/range/sparseMirror.cjs');
const { withRangedSource } = require('../../../js/download/rangedSource.cjs');

describe('download/rangedSource.withRangedSource', () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn() };
  let deps;
  let options;
  const mirror = {
    dir: '/tmp/m',
    dataPath: '/tmp/m/sample.bam',
    indexPath: '/idx/sample.bam.bai',
    stats: { bytes: 5_000_000, requests: 12, fileSize: 1_000_000_000 },
  };

  beforeEach(() => {
    deps = { agent: {}, logger, metrics: { totalBytesDownloaded: 0 } };
    options = {
      strategy: 'planned',
      url: 'https://signed/sample.bam',
      indexPath: '/idx/sample.bam.bai',
      format: 'bam',
      regions: ['chr1:1-100'],
      includeUnmapped: false,
      outputs: ['/nonexistent/out.bam'],
      overwrite: false,
      fileName: 'sample.bam',
    };
  });

  test('planned: runs on the mirror, records bytes and cleans up', async () => {
    buildSparseMirror.mockResolvedValue(mirror);
    const run = jest.fn(async () => {});
    await withRangedSource(options, deps, run);
    expect(buildSparseMirror).toHaveBeenCalledWith(
      expect.objectContaining({
        url: options.url,
        format: 'bam',
        regions: ['chr1:1-100'],
        dispatcher: deps.agent,
      }),
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({
      location: mirror.dataPath,
      indexPath: mirror.indexPath,
    });
    expect(deps.metrics.totalBytesDownloaded).toBe(5_000_000);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringMatching(
        /fetched 5\.0 MB in 12 requests \(0\.5% of 1\.00 GB\)/,
      ),
    );
    expect(removeSparseMirror).toHaveBeenCalledWith(mirror);
  });

  test('stream strategy never builds a mirror', async () => {
    const run = jest.fn(async () => {});
    await withRangedSource({ ...options, strategy: 'stream' }, deps, run);
    expect(buildSparseMirror).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith({
      location: options.url,
      indexPath: options.indexPath,
    });
  });

  test('skips planning when every output exists and overwrite is off', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'varvis-rs-'));
    try {
      const out = path.join(dir, 'out.bam');
      fs.writeFileSync(out, 'x');
      const run = jest.fn(async () => {});
      await withRangedSource({ ...options, outputs: [out] }, deps, run);
      expect(buildSparseMirror).not.toHaveBeenCalled();
      expect(run).toHaveBeenCalledWith(
        expect.objectContaining({ location: options.url }),
      );

      await withRangedSource(
        { ...options, outputs: [out], overwrite: true },
        { ...deps },
        jest.fn(async () => {}),
      );
      expect(buildSparseMirror).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('falls back to the remote URL when mirror building fails', async () => {
    buildSparseMirror.mockRejectedValue(new Error('Unsupported index format'));
    const run = jest.fn(async () => {});
    await withRangedSource(options, deps, run);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/Unsupported index format.*streamed remote/),
    );
    expect(run).toHaveBeenCalledWith({
      location: options.url,
      indexPath: options.indexPath,
    });
    expect(removeSparseMirror).not.toHaveBeenCalled();
  });

  test('falls back when the tool fails on the mirror, then cleans up', async () => {
    buildSparseMirror.mockResolvedValue(mirror);
    const run = jest
      .fn()
      .mockRejectedValueOnce(new Error('samtools exited with code 1'))
      .mockResolvedValueOnce();
    await withRangedSource(options, deps, run);
    expect(run.mock.calls.map(([s]) => s.location)).toEqual([
      mirror.dataPath,
      options.url,
    ]);
    expect(removeSparseMirror).toHaveBeenCalledWith(mirror);
  });

  test('a failing streamed retry propagates', async () => {
    buildSparseMirror.mockRejectedValue(new Error('plan failed'));
    const run = jest.fn(async () => {
      throw new Error('remote failed');
    });
    await expect(withRangedSource(options, deps, run)).rejects.toThrow(
      'remote failed',
    );
  });
});
