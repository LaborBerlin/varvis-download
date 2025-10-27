import baseConfig from './eslint.config.base.js';
import jsdocConfig from './eslint.config.jsdoc.js';
import unicornConfig from './eslint.config.unicorn.js';
import securityConfig from './eslint.config.security.js';
import testsConfig from './eslint.config.tests.js';

/**
 * Main ESLint configuration - composes modular configs
 */
export default [
  // Global ignores
  {
    ignores: [
      'development/',
      'node_modules/',
      'logs/',
      'download/',
      'docs/.vitepress/',
      'dist/',
      'build/',
      'coverage/',
      'plan/',
    ],
  },

  // Base configuration
  baseConfig,

  // JSDoc validation
  jsdocConfig,

  // Modern JavaScript patterns
  unicornConfig,

  // Security rules
  securityConfig,

  // Test-specific configuration
  testsConfig,

  // ESLint config files use ES modules
  {
    files: ['eslint.config*.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },

  // Documentation script files
  {
    files: ['docs/scripts/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      'jsdoc/require-jsdoc': 'off', // Internal doc scripts
    },
  },
];
