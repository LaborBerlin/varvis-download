/**
 * Test fixtures for Varvis Download CLI
 * Centralized test data to avoid duplication
 * Follows DRY principle
 */

/**
 * Standard analysis fixtures
 * Use: const analysis = fixtures.analyses.snv;
 */
const analyses = {
  snv: {
    id: 'AN_SNV_001',
    sampleId: 'SAM001',
    limsId: 'LIMS001',
    analysisType: 'SNV',
    status: 'completed',
    createdAt: '2025-01-01T00:00:00Z',
    files: [
      {
        fileName: 'sample.vcf.gz',
        fileType: 'vcf.gz',
        url: 'https://api.example.com/files/sample.vcf.gz',
        size: 1024000,
        archived: false,
      },
      {
        fileName: 'sample.vcf.gz.tbi',
        fileType: 'vcf.gz.tbi',
        url: 'https://api.example.com/files/sample.vcf.gz.tbi',
        size: 5120,
        archived: false,
      },
    ],
  },

  cnv: {
    id: 'AN_CNV_001',
    sampleId: 'SAM002',
    limsId: 'LIMS002',
    analysisType: 'CNV',
    status: 'completed',
    createdAt: '2025-01-02T00:00:00Z',
    files: [
      {
        fileName: 'sample.bam',
        fileType: 'bam',
        url: 'https://api.example.com/files/sample.bam',
        size: 52428800, // 50MB
        archived: false,
      },
      {
        fileName: 'sample.bam.bai',
        fileType: 'bam.bai',
        url: 'https://api.example.com/files/sample.bam.bai',
        size: 10240,
        archived: false,
      },
    ],
  },

  archived: {
    id: 'AN_ARCHIVED_001',
    sampleId: 'SAM003',
    limsId: 'LIMS003',
    analysisType: 'SNV',
    status: 'completed',
    createdAt: '2025-01-03T00:00:00Z',
    files: [
      {
        fileName: 'sample.bam',
        fileType: 'bam',
        url: 'https://api.example.com/files/sample.bam',
        size: 52428800,
        archived: true, // Key difference
        archiveStatus: 'archived',
      },
    ],
  },
};

/**
 * Filter expression fixtures
 */
const filters = {
  equality: {
    expression: 'analysisType=SNV',
    expected: { field: 'analysisType', operator: '=', value: 'SNV' },
  },
  inequality: {
    expression: 'status!=pending',
    expected: { field: 'status', operator: '!=', value: 'pending' },
  },
  greaterThan: {
    expression: 'id>100',
    expected: { field: 'id', operator: '>', value: '100' },
  },
  lessThan: {
    expression: 'id<500',
    expected: { field: 'id', operator: '<', value: '500' },
  },
};

/**
 * Configuration fixtures
 */
const configs = {
  valid: {
    username: 'testuser',
    target: 'testenv',
    destination: './downloads',
    loglevel: 'info',
  },

  invalid: {
    // Missing required fields
    destination: './downloads',
  },

  withProxy: {
    username: 'testuser',
    target: 'testenv',
    destination: './downloads',
    proxy: 'http://proxy.example.com:8080',
    proxyUsername: 'proxyuser',
    proxyPassword: 'proxypass',
  },
};

/**
 * Error response fixtures
 */
const errors = {
  unauthorized: {
    status: 401,
    message: 'Unauthorized',
    code: 'AUTH_FAILED',
  },

  notFound: {
    status: 404,
    message: 'Resource not found',
    code: 'NOT_FOUND',
  },

  serverError: {
    status: 500,
    message: 'Internal server error',
    code: 'SERVER_ERROR',
  },

  networkError: {
    code: 'ECONNRESET',
    message: 'Connection reset by peer',
  },
};

/**
 * Genomic range fixtures for rangedUtils tests
 */
const genomicRanges = {
  valid: {
    single: 'chr1:1000-2000',
    multiple: ['chr1:1000-2000', 'chr2:3000-4000'],
    wholeChr: 'chr1',
  },

  invalid: {
    malformed: 'invalid-range',
    negativeStart: 'chr1:-100-2000',
    startGreaterThanEnd: 'chr1:2000-1000',
  },
};

module.exports = {
  analyses,
  filters,
  configs,
  errors,
  genomicRanges,
};
