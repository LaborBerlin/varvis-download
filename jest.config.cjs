module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['js/**/*.js', '!js/**/*.test.js', '!node_modules/**'],
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['tests/integration/e2e/'],
  verbose: true,
  testTimeout: 30000,
  clearMocks: true,
  restoreMocks: true,
};
