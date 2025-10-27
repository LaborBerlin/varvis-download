/**
 * Test utilities for Varvis Download CLI
 * Provides reusable test helpers following DRY and SOLID principles
 */

const fs = require('node:fs/promises');
const path = require('node:path');

/**
 * Creates a temporary test directory
 * Cleans up automatically after tests
 */
class TestDirectory {
  constructor(basePath = '.test-tmp') {
    this.basePath = basePath;
    this.created = [];
  }

  async create(name = `test-${Date.now()}`) {
    const dir = path.join(this.basePath, name);
    await fs.mkdir(dir, { recursive: true });
    this.created.push(dir);
    return dir;
  }

  async cleanup() {
    for (const dir of this.created) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    this.created = [];
  }
}

/**
 * Wait for a condition to be true
 * Useful for async operations
 *
 * @param {Function} conditionFn - Function that returns boolean or Promise<boolean>
 * @param {number} timeout - Timeout in milliseconds
 * @param {number} interval - Check interval in milliseconds
 * @returns {Promise<boolean>}
 */
async function waitFor(conditionFn, timeout = 5000, interval = 100) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await conditionFn()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Creates a readable stream from a string
 * For testing download streams
 *
 * @param {string} content - Content to stream
 * @returns {ReadableStream}
 */
function createMockStream(content) {
  const { Readable } = require('node:stream');
  const stream = new Readable();
  stream.push(content);
  stream.push(null);
  return stream;
}

module.exports = {
  TestDirectory,
  waitFor,
  createMockStream,
};
