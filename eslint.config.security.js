import security from 'eslint-plugin-security';
import noSecrets from 'eslint-plugin-no-secrets';

/**
 * Security rules to detect vulnerabilities and prevent secrets in code
 * Combines eslint-plugin-security (SAST) and eslint-plugin-no-secrets
 */
export default {
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
        tolerance: 4.5, // Higher tolerance to reduce false positives
        ignoreContent: /^VARVIS_/, // Ignore env var names
        ignoreModules: true,
        ignoreIdentifiers: ['token', 'csrf', 'agent', 'password', 'username'], // Variable names that are not secrets
      },
    ],
  },
};
