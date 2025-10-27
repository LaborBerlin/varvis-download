/**
 * Mock object factories for Varvis Download CLI
 * Follows Factory Pattern and DRY principle
 * Creates consistent, reusable mocks
 */

/**
 * Creates a mock undici Agent
 * Used for testing HTTP requests
 *
 * @param {Object} options - Override default behavior
 * @param {number} options.statusCode - HTTP status code
 * @param {Object} options.body - Response body
 * @param {Object} options.headers - Response headers
 * @param {boolean} options.shouldFail - Whether request should fail
 * @param {Error} options.failureError - Error to throw if shouldFail is true
 * @returns {Object} Mock Agent with request method
 */
function createMockAgent(options = {}) {
  const {
    statusCode = 200,
    body = { data: [] },
    headers = { 'content-type': 'application/json' },
    shouldFail = false,
    failureError = new Error('Network error'),
  } = options;

  const mockRequest = jest.fn(async () => {
    if (shouldFail) {
      throw failureError;
    }
    return {
      statusCode,
      headers,
      body: {
        json: async () => body,
        text: async () => JSON.stringify(body),
      },
    };
  });

  return {
    request: mockRequest,
    close: jest.fn(),
  };
}

/**
 * Creates a mock logger (Winston interface)
 * Follows Interface Segregation (only methods we use)
 *
 * @returns {Object} Mock logger with info, error, warn, debug methods
 */
function createMockLogger() {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    level: 'info',
  };
}

/**
 * Creates a mock readline interface
 * For testing password prompts
 *
 * @param {Object} answers - Map of prompt to answer
 * @returns {Object} Mock readline interface
 */
function createMockReadline(answers = {}) {
  return {
    question: jest.fn((prompt, callback) => {
      const answer = answers[prompt] || '';
      callback(answer);
    }),
    close: jest.fn(),
  };
}

/**
 * Creates a mock Progress bar
 * For testing download progress
 *
 * @returns {Function} Mock Progress constructor
 */
function createMockProgress() {
  return jest.fn().mockImplementation(function (format, options) {
    this.tick = jest.fn();
    this.update = jest.fn();
    this.terminate = jest.fn();
    this.curr = 0;
    this.total = options?.total || 100;
    return this;
  });
}

/**
 * Builder pattern for complex mock analysis objects
 * Allows chaining for customization
 */
class MockAnalysisBuilder {
  constructor() {
    this.data = {
      id: 'AN001',
      sampleId: 'SAM001',
      limsId: 'LIMS001',
      analysisType: 'SNV',
      status: 'completed',
      createdAt: '2025-01-01T00:00:00Z',
      files: [],
    };
  }

  withId(id) {
    this.data.id = id;
    return this;
  }

  withSampleId(sampleId) {
    this.data.sampleId = sampleId;
    return this;
  }

  withLimsId(limsId) {
    this.data.limsId = limsId;
    return this;
  }

  withType(analysisType) {
    this.data.analysisType = analysisType;
    return this;
  }

  withFiles(files) {
    this.data.files = files;
    return this;
  }

  archived() {
    this.data.archived = true;
    return this;
  }

  build() {
    return { ...this.data };
  }
}

module.exports = {
  createMockAgent,
  createMockLogger,
  createMockReadline,
  createMockProgress,
  MockAnalysisBuilder,
};
