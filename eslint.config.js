/**
 * ESLint Configuration (Consolidated)
 *
 * This single configuration file replaces the previous modular setup:
 * - eslint.config.base.js     → Base rules & Prettier integration
 * - eslint.config.jsdoc.js    → JSDoc validation
 * - eslint.config.unicorn.js  → Modern JavaScript patterns
 * - eslint.config.security.js → Security rules & secrets detection
 * - eslint.config.tests.js    → Test file overrides
 *
 * @see https://eslint.org/docs/latest/use/configure/configuration-files
 */

import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
import unicorn from 'eslint-plugin-unicorn';
import security from 'eslint-plugin-security';
import noSecrets from 'eslint-plugin-no-secrets';

export default [
  // ─────────────────────────────────────────────────────────────────────────────
  // Global Ignores
  // ─────────────────────────────────────────────────────────────────────────────
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
      'config/', // User app configs
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Base Configuration (all JS/CJS files)
  // Includes: ESLint recommended, Prettier integration, common rules
  // ─────────────────────────────────────────────────────────────────────────────
  {
    files: ['**/*.{js,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
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
        URLSearchParams: 'readonly',
      },
    },
    plugins: {
      prettier,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-useless-escape': 'warn',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // JSDoc Validation (source files only)
  // Enforces documentation standards and validates types
  // ─────────────────────────────────────────────────────────────────────────────
  {
    files: ['js/**/*.cjs', '*.cjs'],
    plugins: {
      jsdoc,
    },
    settings: {
      jsdoc: {
        mode: 'typescript',
        tagNamePreference: {
          returns: 'returns',
          augments: 'extends',
        },
      },
    },
    rules: {
      // Critical: Must have proper structure (errors)
      'jsdoc/check-tag-names': 'error',
      'jsdoc/check-types': 'error',
      'jsdoc/require-param-name': 'error',
      'jsdoc/require-returns-type': 'error',
      'jsdoc/valid-types': 'error',
      'jsdoc/empty-tags': 'error',

      // Required documentation (errors)
      'jsdoc/check-param-names': 'error',
      'jsdoc/require-jsdoc': [
        'error',
        {
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
          contexts: [
            'ExportNamedDeclaration > FunctionDeclaration',
            'ExportDefaultDeclaration > FunctionDeclaration',
          ],
        },
      ],
      'jsdoc/require-param': 'error',
      'jsdoc/require-param-type': 'error',
      'jsdoc/require-returns': [
        'error',
        {
          forceReturnsWithAsync: true,
        },
      ],
      'jsdoc/require-returns-check': 'error',

      // Documentation quality (warnings)
      'jsdoc/check-alignment': 'warn',
      'jsdoc/require-description': 'warn',
      'jsdoc/require-param-description': 'warn',
      'jsdoc/require-returns-description': 'warn',
      'jsdoc/check-line-alignment': [
        'warn',
        'always',
        {
          tags: ['param', 'returns', 'type'],
        },
      ],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Modern JavaScript Patterns (unicorn)
  // Selective rules that improve code quality without being overly opinionated
  // ─────────────────────────────────────────────────────────────────────────────
  {
    files: ['**/*.{js,cjs}'],
    plugins: {
      unicorn,
    },
    rules: {
      // Node.js protocol (auto-fixable) - MANDATORY
      'unicorn/prefer-node-protocol': 'error',

      // Modern JavaScript (auto-fixable)
      'unicorn/prefer-spread': 'error',
      'unicorn/prefer-string-slice': 'error',
      'unicorn/prefer-includes': 'error',
      'unicorn/prefer-array-flat-map': 'error',
      'unicorn/prefer-string-starts-ends-with': 'error',
      'unicorn/prefer-string-trim-start-end': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-array-find': 'error',
      'unicorn/prefer-object-from-entries': 'error',

      // Code quality (non-auto-fixable)
      'unicorn/filename-case': [
        'error',
        {
          case: 'camelCase',
          ignore: [
            'CLAUDE.md',
            'README.md',
            'LICENSE',
            'TOOLING_MODERNIZATION_PLAN.md',
            'IMPLEMENTATION_GUIDE.md',
            '\\.config\\..*\\.js$',
            '\\.test\\.js$',
            'varvis-download\\.cjs$',
            'docs-generator\\.cjs$',
            'cli-runner\\.js$',
          ],
        },
      ],
      'unicorn/no-useless-undefined': 'error',
      'unicorn/prefer-type-error': 'error',
      'unicorn/throw-new-error': 'error',

      // Disabled (too opinionated or conflicts with CommonJS)
      'unicorn/prefer-module': 'off',
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/no-array-for-each': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prefer-ternary': 'off',
      'unicorn/explicit-length-check': 'off',
      'unicorn/no-array-callback-reference': 'off',
      'unicorn/numeric-separators-style': 'off',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Security Rules
  // Detects vulnerabilities (SAST) and prevents secrets in code
  // ─────────────────────────────────────────────────────────────────────────────
  {
    files: ['**/*.{js,cjs}'],
    plugins: {
      security,
      'no-secrets': noSecrets,
    },
    rules: {
      // eslint-plugin-security: Common security vulnerabilities
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn', // We use child_process legitimately for samtools/tabix
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'off', // Too strict for CLI tools with user-provided paths
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-require': 'off', // We use dynamic requires in some places
      'security/detect-object-injection': 'off', // Too many false positives
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-unsafe-regex': 'error',

      // eslint-plugin-no-secrets: Prevent secrets in code
      'no-secrets/no-secrets': [
        'error',
        {
          tolerance: 4.5,
          ignoreContent: /^VARVIS_/,
          ignoreModules: true,
          ignoreIdentifiers: ['token', 'csrf', 'agent', 'password', 'username'],
        },
      ],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Test Files Configuration
  // Relaxed JSDoc requirements and additional globals
  // ─────────────────────────────────────────────────────────────────────────────
  {
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
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
      'no-unused-vars': 'off',
      'security/detect-child-process': 'off', // Tests legitimately spawn child processes
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ESLint Config File (ES Modules)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    files: ['eslint.config.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Documentation Scripts
  // Internal doc generation scripts don't need full JSDoc
  // ─────────────────────────────────────────────────────────────────────────────
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
      'jsdoc/require-jsdoc': 'off',
    },
  },
];
