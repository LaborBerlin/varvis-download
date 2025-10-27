# Testing Guide

## Overview

This guide explains the testing philosophy, structure, and best practices for the Varvis Download CLI project. Our testing approach follows **Classical School TDD** with a **70-20-10 test pyramid** to achieve maintainable, high-quality tests.

## Testing Philosophy

### Classical School TDD (Detroit School)

We follow the Classical School approach to testing:

**Mock Only I/O Boundaries:**
- ✅ Network calls (undici HTTP requests)
- ✅ File system operations (fs/promises)
- ✅ Child processes (spawn/exec for samtools, tabix, bgzip)
- ✅ System time (Date.now() for predictable tests)

**Test Real Implementations:**
- ✅ Pure functions (string parsing, data transformations)
- ✅ Business logic (filtering, validation, calculations)
- ✅ Data structures (object manipulation, array operations)
- ✅ Module integration (how modules work together)

### Test Pyramid (70-20-10)

```
        E2E (10%)
      /            \
    Integration (20%)
  /                    \
Unit Tests (70%)
```

- **Unit Tests (70%)**: Test individual functions and modules in isolation
- **Integration Tests (20%)**: Test how modules work together (2-3 modules)
- **E2E Tests (10%)**: Test complete workflows against real playground server

## Test Structure

### Directory Layout

```
tests/
├── helpers/
│   ├── fixtures.js        # Centralized test data
│   ├── mockFactories.js   # Mock object creators
│   └── testUtils.js       # Reusable test utilities
├── setup.js               # Global test configuration
├── unit/                  # Unit tests (70%)
│   ├── logger.test.js
│   ├── apiClient.test.js
│   └── ...
└── integration/          # Integration tests (20% + 10%)
    └── e2e/             # End-to-end tests
```

### Test File Naming

- Unit tests: `<module>.test.js`
- Integration tests: `<feature>.integration.test.js`
- E2E tests: `<workflow>.e2e.test.js`

## Writing Tests

### AAA Pattern

All tests follow the **Arrange-Act-Assert** pattern:

```javascript
test('should download file with progress tracking', async () => {
  // Arrange: Set up test data and mocks
  const mockAgent = createMockAgent({ statusCode: 200 });
  const mockLogger = createMockLogger();
  const testFile = fixtures.analyses.snv.files[0];

  // Act: Execute the function under test
  const result = await downloadFile(testFile, mockAgent, mockLogger);

  // Assert: Verify the outcome
  expect(result.success).toBe(true);
  expect(mockLogger.info).toHaveBeenCalledWith(
    expect.stringContaining('Downloaded')
  );
});
```

### Using Test Helpers

#### Fixtures (Static Test Data)

```javascript
const { analyses, filters, genomicRanges } = require('../helpers/fixtures');

test('should filter SNV analyses', () => {
  const analysis = analyses.snv; // Centralized fixture
  expect(analysis.analysisType).toBe('SNV');
});
```

#### Mock Factories (Dynamic Mocks)

```javascript
const { createMockAgent, createMockLogger } = require('../helpers/mockFactories');

test('should handle API errors', async () => {
  const mockAgent = createMockAgent({
    shouldFail: true,
    failureError: new Error('Network timeout'),
  });

  await expect(fetchAnalyses(mockAgent)).rejects.toThrow('Network timeout');
});
```

#### Test Utilities

```javascript
const { TestDirectory, waitFor } = require('../helpers/testUtils');

test('should create temporary files', async () => {
  const testDir = new TestDirectory();
  const dir = await testDir.create('my-test');

  // Write files to dir...

  await testDir.cleanup(); // Automatic cleanup
});
```

### Builder Pattern for Complex Objects

```javascript
const { MockAnalysisBuilder } = require('../helpers/mockFactories');

test('should handle archived files', () => {
  const analysis = new MockAnalysisBuilder()
    .withId('AN_CUSTOM_001')
    .withType('CNV')
    .archived()
    .build();

  expect(analysis.archived).toBe(true);
});
```

## Coverage Goals

### Progressive Thresholds

We increase coverage incrementally to maintain quality:

| Phase | Target | Focus Areas |
|-------|--------|-------------|
| Phase 0 | 40% | Foundation (helpers, setup) |
| Phase 1 | 50% | Quick wins (logger, apiClient) |
| Phase 2 | 60% | Core utilities (fileUtils, fetchUtils) |
| Phase 3 | 70% | Business logic (rangedUtils, archiveUtils) |
| Final | 80% | Integration tests, edge cases |

### Current Thresholds (jest.config.cjs)

```javascript
coverageThreshold: {
  global: {
    statements: 40,  // Phase 0
    branches: 35,
    functions: 40,
    lines: 40,
  },
}
```

These will be updated incrementally as we progress through phases.

## Best Practices

### DO ✅

- **Test behavior, not implementation**: Focus on what the function does, not how
- **Use descriptive test names**: `should download file when authentication succeeds`
- **Keep tests isolated**: No shared state between tests
- **Mock only I/O boundaries**: Test real business logic
- **Use fixtures for test data**: Centralized, reusable data
- **Follow AAA pattern**: Arrange, Act, Assert
- **Test edge cases**: Empty arrays, null values, malformed input
- **Use beforeEach/afterEach**: Set up and clean up properly

### DON'T ❌

- **Don't mock everything**: Only mock I/O boundaries
- **Don't test private functions**: Test through public API
- **Don't test implementation details**: Test observable behavior
- **Don't share state**: Each test should be independent
- **Don't skip cleanup**: Always clean up resources (files, processes)
- **Don't duplicate test data**: Use fixtures
- **Don't write brittle tests**: Tests should survive refactoring

## Running Tests

### Local Development

```bash
# Run all unit tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/unit/logger.test.js

# Run tests in watch mode
npm test -- --watch

# Run with debug output
DEBUG=true npm test
```

### Integration Tests

```bash
# Setup .env.test file first (see README)
npm run test:integration
```

### CI/CD

Tests run automatically on GitHub Actions for:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

Coverage thresholds are enforced in CI - builds will fail if coverage drops below targets.

## Debugging Tests

### Enable Console Output

```javascript
// In specific test file
beforeAll(() => {
  console.log = global.originalConsole.log;
});
```

Or use DEBUG environment variable:

```bash
DEBUG=true npm test
```

### Jest Debug Mode

```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

Then open `chrome://inspect` in Chrome.

## Common Patterns

### Testing Async Functions

```javascript
test('should fetch analyses from API', async () => {
  const mockAgent = createMockAgent({
    body: { data: [fixtures.analyses.snv] },
  });

  const result = await fetchAnalyses(mockAgent);

  expect(result).toHaveLength(1);
  expect(result[0].id).toBe('AN_SNV_001');
});
```

### Testing Error Handling

```javascript
test('should throw error on invalid range', () => {
  const invalidRange = fixtures.genomicRanges.invalid.malformed;

  expect(() => parseGenomicRange(invalidRange)).toThrow('Invalid range format');
});
```

### Testing File Operations

```javascript
test('should create download directory', async () => {
  const testDir = new TestDirectory();
  const dir = await testDir.create('download-test');

  const fs = require('node:fs/promises');
  await fs.writeFile(path.join(dir, 'test.txt'), 'content');

  const exists = await fs.access(path.join(dir, 'test.txt'))
    .then(() => true)
    .catch(() => false);

  expect(exists).toBe(true);

  await testDir.cleanup();
});
```

### Testing with Streams

```javascript
const { createMockStream } = require('../helpers/testUtils');

test('should process stream data', async () => {
  const stream = createMockStream('test data');
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  expect(chunks.join('')).toBe('test data');
});
```

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Classical vs Mockist Testing](https://martinfowler.com/articles/mocksArentStubs.html)
- [Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
- [AAA Pattern](https://wiki.c2.com/?ArrangeActAssert)

## Questions?

If you have questions about testing approach or need help writing tests:
1. Check this guide first
2. Look at existing test files for examples
3. Review `plan/test-implementation-detailed.md` for comprehensive examples
4. Ask the team for guidance
