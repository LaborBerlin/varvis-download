jest.mock('../../js/download/atomicOutput.cjs', () => ({
  withStagedOutput: jest.fn(async (file, _overwrite, _suffix, action) =>
    action(file),
  ),
}));
const fs = require('node:fs');
const nock = require('nock');
const { fetchWithRetry } = require('../../js/apiClient');
const { triggerRestoreArchivedFile } = require('../../js/archiveUtils');
const { resumeArchivedDownloads } = require('../../js/commands/resume');
const { getDownloadLinks } = require('../../js/fetchUtils');

// Mock fs to avoid writing to real filesystem during tests
jest.mock('fs');
jest.mock('child_process');

// Mock the apiClient to avoid circular dependency issues
jest.mock('../../js/apiClient', () => ({
  fetchWithRetry: jest.fn(),
}));

// Mock the file utils to avoid actual file operations
jest.mock('../../js/fileUtils', () => ({
  downloadFile: jest.fn(),
}));

// Mock the ranged utils
jest.mock('../../js/rangedUtils', () => ({
  ensureIndexFile: jest.fn(),
  generateOutputFileName: jest.fn((fileName, regions) =>
    regions && regions.length > 0
      ? `${fileName.replace(/\.(bam|vcf\.gz)$/, '')}.ranged.${fileName.endsWith('.vcf.gz') ? 'vcf.gz' : 'bam'}`
      : fileName,
  ),
  indexBAM: jest.fn(),
  indexVCF: jest.fn(),
  rangedDownloadBAM: jest.fn(),
  rangedDownloadVCF: jest.fn(),
}));

// Mock fetchUtils getDownloadLinks
jest.mock('../../js/fetchUtils', () => ({
  getDownloadLinks: jest.fn(),
  metrics: {
    startTime: Date.now(),
    totalFilesDownloaded: 0,
    totalBytesDownloaded: 0,
    downloadSpeeds: [],
  },
}));

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Mock agent
const mockAgent = {};

describe('Archive Workflow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockClear();
    fs.readFileSync.mockClear();
    fs.writeFileSync.mockClear();
    nock.cleanAll();

    // Clear mocks for our modules
    const { fetchWithRetry } = require('../../js/apiClient');
    const { getDownloadLinks } = require('../../js/fetchUtils');
    const { downloadFile } = require('../../js/fileUtils');
    const {
      ensureIndexFile,
      indexBAM,
      indexVCF,
      rangedDownloadBAM,
      rangedDownloadVCF,
    } = require('../../js/rangedUtils');

    fetchWithRetry.mockClear();
    getDownloadLinks.mockClear();
    downloadFile.mockClear();
    ensureIndexFile.mockClear();
    indexBAM.mockClear();
    indexVCF.mockClear();
    rangedDownloadBAM.mockClear();
    rangedDownloadVCF.mockClear();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Test Case 3: Resume with Download Failure', () => {
    it('should keep entry when download fails', async () => {
      // Arrange
      const analysisId = 'test-analysis-789';
      const fileName = 'test-file-fail.bam';
      const target = 'test-target';
      const token = 'test-token';
      const restorationFile = 'test-awaiting-restoration.json';
      const destination = '/test/destination';

      const restoredOptions = {
        destination: '/custom/destination',
        overwrite: false,
      };

      // Mock restoration file with past restoration time
      const pastTime = new Date(Date.now() - 60000).toISOString();
      const awaitingData = [
        {
          analysisId,
          fileName,
          restoreEstimation: pastTime,
          options: restoredOptions,
        },
      ];

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(awaitingData));

      // Mock getDownloadLinks to return non-archived file
      getDownloadLinks.mockResolvedValueOnce({
        [fileName]: {
          fileName,
          downloadLink: `https://${target}.varvis.com/download/${fileName}`,
          currentlyArchived: false,
        },
        [`${fileName}.bai`]: {
          fileName: `${fileName}.bai`,
          downloadLink: `https://${target}.varvis.com/download/${fileName}.bai`,
          currentlyArchived: false,
        },
      });

      // Mock the downloadFile to throw an error (simulating download failure)
      const { downloadFile } = require('../../js/fileUtils');
      downloadFile
        .mockResolvedValueOnce() // Index succeeds before the BAM download fails.
        .mockRejectedValueOnce(new Error('Download failed'));

      // Act
      await resumeArchivedDownloads(
        restorationFile,
        destination,
        target,
        token,
        mockAgent,
        mockLogger,
        false,
      );

      // Assert
      // Should keep the original entry since download failed
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        restorationFile,
        JSON.stringify(awaitingData, null, 2),
      );

      // The download failure is caught inside the shared BAM handler (which
      // reports { ok: false }), not resume's own outer per-entry catch.
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error during full download'),
      );
    });

    it('should keep entry when file is still archived', async () => {
      // Arrange
      const analysisId = 'test-analysis-still-archived';
      const fileName = 'test-file-still-archived.bam';
      const target = 'test-target';
      const token = 'test-token';
      const restorationFile = 'test-awaiting-restoration.json';
      const destination = '/test/destination';

      const restoredOptions = {
        destination: '/custom/destination',
        overwrite: false,
      };

      // Mock restoration file with past restoration time
      const pastTime = new Date(Date.now() - 60000).toISOString();
      const awaitingData = [
        {
          analysisId,
          fileName,
          restoreEstimation: pastTime,
          options: restoredOptions,
        },
      ];

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(awaitingData));

      // Mock getDownloadLinks to return still archived file
      getDownloadLinks.mockResolvedValueOnce({
        [fileName]: {
          fileName,
          downloadLink: null,
          currentlyArchived: true, // Still archived
        },
      });

      // Act
      await resumeArchivedDownloads(
        restorationFile,
        destination,
        target,
        token,
        mockAgent,
        mockLogger,
        false,
      );

      // Assert
      // Should keep the original entry since file is still archived
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        restorationFile,
        JSON.stringify(awaitingData, null, 2),
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('is still archived'),
      );
    });

    it('should keep entries that are not ready yet', async () => {
      // Arrange
      const analysisId = 'test-analysis-not-ready';
      const fileName = 'test-file-not-ready.bam';
      const restorationFile = 'test-awaiting-restoration.json';
      const destination = '/test/destination';

      const restoredOptions = {
        destination: '/custom/destination',
        overwrite: false,
      };

      // Mock restoration file with future restoration time
      const futureTime = new Date(Date.now() + 60000).toISOString(); // 1 minute in future
      const awaitingData = [
        {
          analysisId,
          fileName,
          restoreEstimation: futureTime,
          options: restoredOptions,
        },
      ];

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(awaitingData));

      // Act
      await resumeArchivedDownloads(
        restorationFile,
        destination,
        'test-target',
        'test-token',
        mockAgent,
        mockLogger,
        false,
      );

      // Assert
      // Should keep the entry since restoration time hasn't passed
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        restorationFile,
        JSON.stringify(awaitingData, null, 2),
      );

      // Should not attempt any downloads
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Resuming download'),
      );
    });
  });

  describe('Test Case 4: Multiple Entries Mixed Scenarios', () => {
    it('should handle mix of ready, not-ready, and failed entries', async () => {
      // Arrange
      const target = 'test-target';
      const token = 'test-token';
      const restorationFile = 'test-awaiting-restoration.json';
      const destination = '/test/destination';

      const pastTime = new Date(Date.now() - 60000).toISOString();
      const futureTime = new Date(Date.now() + 60000).toISOString();

      const awaitingData = [
        {
          analysisId: 'ready-success',
          fileName: 'ready-success.bam',
          restoreEstimation: pastTime,
          options: { destination: '/custom1' },
        },
        {
          analysisId: 'not-ready',
          fileName: 'not-ready.bam',
          restoreEstimation: futureTime,
          options: { destination: '/custom2' },
        },
        {
          analysisId: 'ready-fail',
          fileName: 'ready-fail.bam',
          restoreEstimation: pastTime,
          options: { destination: '/custom3' },
        },
      ];

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(awaitingData));

      // Mock getDownloadLinks for successful entry
      getDownloadLinks
        .mockResolvedValueOnce({
          'ready-success.bam': {
            fileName: 'ready-success.bam',
            downloadLink: `https://${target}.varvis.com/download/ready-success.bam`,
            currentlyArchived: false,
          },
          'ready-success.bam.bai': {
            fileName: 'ready-success.bam.bai',
            downloadLink: `https://${target}.varvis.com/download/ready-success.bam.bai`,
            currentlyArchived: false,
          },
        })
        .mockResolvedValueOnce({
          'ready-fail.bam': {
            fileName: 'ready-fail.bam',
            downloadLink: `https://${target}.varvis.com/download/ready-fail.bam`,
            currentlyArchived: false,
          },
          'ready-fail.bam.bai': {
            fileName: 'ready-fail.bam.bai',
            downloadLink: `https://${target}.varvis.com/download/ready-fail.bam.bai`,
            currentlyArchived: false,
          },
        });

      // Mock downloadFile - first call succeeds, second fails
      const { downloadFile } = require('../../js/fileUtils');
      const { indexBAM } = require('../../js/rangedUtils');
      downloadFile
        .mockResolvedValueOnce() // Success for ready-success.bam.bai
        .mockResolvedValueOnce() // Success for ready-success.bam
        .mockResolvedValueOnce() // Success for ready-fail.bam.bai
        .mockRejectedValueOnce(new Error('Download failed')); // Failure for ready-fail.bam

      indexBAM
        .mockResolvedValueOnce() // Success for ready-success.bam indexing
        .mockResolvedValueOnce(); // Success for ready-fail.bam indexing (even though download failed)

      // Act
      await resumeArchivedDownloads(
        restorationFile,
        destination,
        target,
        token,
        mockAgent,
        mockLogger,
        false,
      );

      // Assert
      // Should only keep the not-ready and failed entries
      const expectedRemainingEntries = [
        awaitingData[1], // not-ready entry
        awaitingData[2], // ready-fail entry
      ];

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        restorationFile,
        JSON.stringify(expectedRemainingEntries, null, 2),
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('2 entries remaining'),
      );
    });
  });
});
