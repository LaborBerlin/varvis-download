const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { createMockLogger } = require('../../helpers/mockFactories');
const { runVcfPipeline } = require('../../../js/download/vcfPipeline.cjs');

jest.mock('node:child_process');
jest.mock('node:fs');

function child() {
  const proc = new EventEmitter();
  proc.exitCode = null;
  proc.signalCode = null;
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.stdin = new PassThrough();
  proc.kill = jest.fn(() => {
    proc.stdout.destroy();
    proc.stderr.destroy();
    proc.stdin.destroy();
    process.nextTick(() => proc.emit('close', null, 'SIGTERM'));
    return true;
  });
  return proc;
}

describe('download/vcfPipeline process lifecycle', () => {
  let tabix, bgzip, output, logger;
  beforeEach(() => {
    tabix = child();
    bgzip = child();
    output = new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    });
    logger = createMockLogger();
    spawn.mockReturnValueOnce(tabix).mockReturnValueOnce(bgzip);
    fs.createWriteStream.mockReturnValue(output);
  });

  function run() {
    return runVcfPipeline(
      'https://example.org/data.vcf.gz',
      '1:1-9',
      '/tmp/result.vcf.gz',
      '/tmp/data.vcf.gz.tbi',
      logger,
    );
  }

  test('waits for late tabix close and rejects its failure after bgzip succeeds', async () => {
    const result = run();
    const rejected = expect(result).rejects.toThrow(
      'tabix process exited with code 3',
    );
    tabix.stdout.end('records');
    bgzip.stdout.end('compressed');
    bgzip.emit('close', 0);
    await new Promise((resolve) => output.on('finish', resolve));
    tabix.emit('close', 3);
    await rejected;
  });

  test('resolves only when both children and output have completed', async () => {
    const result = run();
    let resolved = false;
    result.then(() => {
      resolved = true;
    });
    tabix.stdout.end('records');
    bgzip.stdout.end('compressed');
    bgzip.emit('close', 0);
    await new Promise((resolve) => output.on('finish', resolve));
    await Promise.resolve();
    expect(resolved).toBe(false);
    tabix.emit('close', 0);
    await result;
  });

  test.each(['tabix stdout', 'bgzip stdin', 'bgzip stdout', 'output'])(
    'aborts children when %s fails',
    async (name) => {
      const result = run();
      const rejected = expect(result).rejects.toThrow('broken stream');
      const streams = {
        'tabix stdout': tabix.stdout,
        'bgzip stdin': bgzip.stdin,
        'bgzip stdout': bgzip.stdout,
        output,
      };
      streams[name].destroy(new Error('broken stream'));
      await rejected;
      expect(tabix.kill).toHaveBeenCalled();
      expect(bgzip.kill).toHaveBeenCalled();
      expect(output.destroyed).toBe(true);
    },
  );

  test('caps diagnostics and redacts a signed URL split across stderr events', async () => {
    const result = run();
    const rejected = result.catch((error) => error);
    tabix.stderr.write('cannot read https://example.org/data?sig=');
    tabix.stderr.write('private-value\n' + 'x'.repeat(20000));
    tabix.emit('close', 1);
    const error = await rejected;
    expect(error.message).toContain('[redacted URL]');
    expect(error.message).not.toContain('private-value');
    expect(error.message.length).toBeLessThan(8500);
    expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(
      'private-value',
    );
  });
});
