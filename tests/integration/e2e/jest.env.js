// jest.env.js - Custom environment setup for integration tests
const path = require('path');
const fs = require('fs');

// Load .env.test file explicitly (for local development)
const envTestPath = path.resolve(__dirname, '../../../.env.test');
if (fs.existsSync(envTestPath)) {
  const envContent = fs.readFileSync(envTestPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=');
        process.env[key] = value;
      }
    }
  });
  console.log('✓ Loaded .env.test file for integration tests');
} else {
  // Check if credentials are available as environment variables (for CI/CD)
  if (
    process.env.VARVIS_PLAYGROUND_USER &&
    process.env.VARVIS_PLAYGROUND_PASS
  ) {
    console.log('✓ Using credentials from environment variables');
  } else {
    console.warn(
      '⚠ No .env.test file found and no environment variables set. Integration tests will fail without credentials.',
    );
  }
}
