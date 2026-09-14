const { setImmediate } = require('node:timers');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');

function createMockToolProcess(code = 0) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = jest.fn(() => {
    child.stdout.destroy();
    child.stdin.destroy();
    child.stderr.destroy();
    return true;
  });
  setImmediate(() => {
    child.stdout.end('records');
    child.stderr.end();
    child.exitCode = code;
    child.emit('close', code);
  });
  jest.spyOn(child.stdout, 'pipe');
  return child;
}

function createMockToolOutput() {
  return new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
}

module.exports = { createMockToolProcess, createMockToolOutput };
