const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { rangedDownloadVCF } = require('../../js/rangedUtils.cjs');
const { createMockLogger } = require('../helpers/mockFactories');

jest.mock('node:child_process');
jest.mock('node:fs');
jest.mock('../../js/fileUtils.cjs');

function createMockProcess() {
  const proc = new EventEmitter();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.stdin = new PassThrough();
  proc.exitCode = null;
  proc.signalCode = null;
  proc.kill = jest.fn(() => {
    proc.stdout.destroy();
    proc.stderr.destroy();
    proc.stdin.destroy();
    proc.signalCode = 'SIGTERM';
    process.nextTick(() => proc.emit('close', null, 'SIGTERM'));
    return true;
  });
  return proc;
}

describe('rangedDownloadVCF pipeline failure cleanup', () => {
  let tabix, bgzip, output, logger, metrics;

  beforeEach(() => {
    tabix = createMockProcess();
    bgzip = createMockProcess();
    output = new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    });
    logger = createMockLogger();
    metrics = { totalFilesDownloaded: 0, totalFilesSkipped: 0 };
    fs.existsSync.mockReturnValue(false);
    spawn.mockReturnValueOnce(tabix).mockReturnValueOnce(bgzip);
    fs.createWriteStream.mockReturnValue(output);
  });

  function run() {
    return rangedDownloadVCF(
      'https://example.com/test.vcf.gz',
      'chr1:1000-2000',
      '/path/to/output.vcf.gz',
      '/path/to/index.tbi',
      logger,
      metrics,
      true,
      { enabled: false },
    );
  }

  test('rejects and terminates both tools on output error', async () => {
    const download = run();
    const rejected = expect(download).rejects.toThrow('ENOSPC');
    output.destroy(new Error('ENOSPC: no space left on device'));
    await rejected;
    expect(tabix.kill).toHaveBeenCalled();
    expect(bgzip.kill).toHaveBeenCalled();
    expect(fs.renameSync).not.toHaveBeenCalled();
    expect(metrics.totalFilesDownloaded).toBe(0);
  });

  test('removes partial output and preserves the existing destination on failure', async () => {
    fs.existsSync.mockReturnValue(true);
    const download = run();
    const rejected = expect(download).rejects.toThrow('EACCES');
    const temporaryFile = fs.createWriteStream.mock.calls[0][0];
    output.destroy(new Error('EACCES: permission denied'));
    await rejected;
    expect(fs.unlinkSync).toHaveBeenCalledWith(temporaryFile);
    expect(fs.unlinkSync).not.toHaveBeenCalledWith('/path/to/output.vcf.gz');
    expect(fs.renameSync).not.toHaveBeenCalled();
    expect(tabix.kill).toHaveBeenCalled();
    expect(bgzip.kill).toHaveBeenCalled();
  });

  test('does not kill tools that have already exited when output fails', async () => {
    const download = run();
    const rejected = expect(download).rejects.toThrow('stream write failure');
    for (const child of [tabix, bgzip]) {
      child.exitCode = 0;
      child.emit('close', 0);
    }
    output.destroy(new Error('stream write failure'));
    await rejected;
    expect(tabix.kill).not.toHaveBeenCalled();
    expect(bgzip.kill).not.toHaveBeenCalled();
  });

  test('strictly caps stderr diagnostics even when a chunk overshoots', async () => {
    const download = run();
    const rejected = expect(download).rejects.toThrow(
      /^tabix process exited with code 1\. Stderr: A{8000}B{192}$/,
    );
    tabix.stderr.write('A'.repeat(8000));
    tabix.stderr.write('B'.repeat(10000));
    tabix.exitCode = 1;
    tabix.emit('close', 1);
    await rejected;
  });
});
