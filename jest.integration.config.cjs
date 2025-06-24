// jest.integration.config.cjs
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/integration/e2e/**/*.test.js'],
  verbose: true,
  testTimeout: 120000, // Increase timeout to 2 minutes for network operations
  clearMocks: true,
  setupFiles: ['<rootDir>/tests/integration/e2e/jest.env.js'], // Custom env setup
  setupFilesAfterEnv: ['./tests/integration/e2e/jest.setup.js'],
};
