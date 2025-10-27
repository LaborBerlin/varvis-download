/**
 * Global test setup for Jest
 * Runs before all tests
 * Configures environment and global mocks
 */

// Increase default timeout for integration tests
jest.setTimeout(30000);

// Mock console methods to reduce test noise
// Store original methods for restoration if needed
global.originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
};

// Suppress console output during tests unless explicitly needed
// Tests can restore console.log in individual test files if needed
beforeAll(() => {
  // Only suppress in test environment, not when debugging
  if (process.env.DEBUG !== 'true') {
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
    console.info = jest.fn();
  }
});

// Restore console after all tests
afterAll(() => {
  if (process.env.DEBUG !== 'true') {
    console.log = global.originalConsole.log;
    console.error = global.originalConsole.error;
    console.warn = global.originalConsole.warn;
    console.info = global.originalConsole.info;
  }
});

// Global cleanup for temporary test directories
const fs = require('node:fs/promises');
const path = require('node:path');

afterAll(async () => {
  // Clean up .test-tmp directory after all tests
  const testTmpDir = path.join(process.cwd(), '.test-tmp');
  try {
    await fs.rm(testTmpDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore errors if directory doesn't exist
    if (error.code !== 'ENOENT') {
      console.error('Failed to clean up .test-tmp directory:', error);
    }
  }
});

// Mock environment variables for consistent testing
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
