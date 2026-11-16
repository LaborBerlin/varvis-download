const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { spawn } = require('node:child_process');
const { spawnPromise } = require('../../js/toolChecks.cjs');
const { createMockLogger } = require('../helpers/mockFactories');

jest.mock('node:child_process');

test('spawn failures include capped, redacted stderr across chunk boundaries', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  spawn.mockReturnValue(child);
  const logger = createMockLogger();
  const result = spawnPromise('samtools', [], logger).catch((error) => error);
  child.stderr.write('read failed: https://example.test/file?');
  child.stderr.write('signature=private-value\n' + 'z'.repeat(20000));
  child.emit('close', 1);
  const error = await result;
  expect(error.message).toContain('Process samtools exited with code 1');
  expect(error.message).toContain('read failed: [redacted URL]');
  expect(error.message).not.toContain('private-value');
  expect(error.message.length).toBeLessThan(8500);
  expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(
    'private-value',
  );
});
