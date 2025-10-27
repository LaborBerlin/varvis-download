module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'js/**/*.{js,cjs}',
    'varvis-download.cjs',
    '!js/**/*.test.js',
    '!node_modules/**',
  ],
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['tests/integration/e2e/'],
  verbose: true,
  testTimeout: 30000,
  clearMocks: true,
  restoreMocks: true,

  // Global test setup
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Coverage reporting
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      statements: 40,
      branches: 30,
      functions: 40,
      lines: 40,
    },
  },
};
