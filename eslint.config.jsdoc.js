import jsdoc from 'eslint-plugin-jsdoc';

/**
 * JSDoc validation configuration
 * Enforces documentation standards and validates types
 */
export default {
  files: ['js/**/*.cjs', '*.cjs'],
  plugins: {
    jsdoc,
  },
  settings: {
    jsdoc: {
      mode: 'typescript', // Validate JSDoc types like TypeScript
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
};
