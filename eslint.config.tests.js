/**
 * ESLint configuration for test files
 * Relaxed JSDoc requirements for tests
 */
export default {
  files: ['test/**/*.js', '**/*.test.js', 'tests/**/*.js'],
  languageOptions: {
    globals: {
      describe: 'readonly',
      test: 'readonly',
      it: 'readonly',
      expect: 'readonly',
      beforeEach: 'readonly',
      afterEach: 'readonly',
      beforeAll: 'readonly',
      afterAll: 'readonly',
      jest: 'readonly',
      setTimeout: 'readonly',
    },
  },
  rules: {
    'jsdoc/require-jsdoc': 'off', // Tests don't need JSDoc
    'jsdoc/require-param': 'off',
    'jsdoc/require-returns': 'off',
    'no-unused-vars': 'off', // Jest fixtures may appear unused
    'security/detect-child-process': 'off', // Tests legitimately spawn child processes
  },
};
