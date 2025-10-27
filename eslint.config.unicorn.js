import unicorn from 'eslint-plugin-unicorn';

/**
 * Modern JavaScript patterns and Node.js best practices
 * Selective rules that improve code quality without being overly opinionated
 */
export default {
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
    'unicorn/prefer-module': 'off', // Project uses CommonJS
    'unicorn/prefer-top-level-await': 'off', // Not available in CommonJS
    'unicorn/prevent-abbreviations': 'off', // Too aggressive
    'unicorn/no-array-reduce': 'off', // reduce is useful
    'unicorn/no-array-for-each': 'off', // forEach is fine
    'unicorn/no-null': 'off', // null is needed for APIs
    'unicorn/prefer-ternary': 'off', // Readability over brevity
    'unicorn/explicit-length-check': 'off', // Verbose
    'unicorn/no-array-callback-reference': 'off', // Too strict
    'unicorn/numeric-separators-style': 'off', // Not needed
  },
};
