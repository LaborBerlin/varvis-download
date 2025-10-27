const fs = require('node:fs');
const nock = require('nock');
const { fetchWithRetry } = require('../../js/apiClient');
const {
  triggerRestoreArchivedFile,
  resumeArchivedDownloads,
} = require('../../js/archiveUtils');
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

  describe('Test Case 1: Restore Initiation', () => {
    it('should trigger restore and save complete options context', async () => {
      // Arrange
      const analysisId = 'test-analysis-123';
      const fileName = 'test-file.bam';
      const target = 'test-target';
      const token = 'test-token';
      const restorationFile = 'test-awaiting-restoration.json';
      const expectedRestoreTime = '2024-12-25T10:00:00Z';

      const options = {
        destination: '/custom/destination',
        overwrite: true,
        range: 'chr1:1000-2000',
        bed: '/path/to/regions.bed',
        restorationFile: restorationFile,
        filetypes: ['bam', 'bam.bai'], // Include filetypes for Bug #32 fix
      };

      const file = { fileName, currentlyArchived: true };

      // Mock the restore API endpoint
      fetchWithRetry.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            success: true,
            response: [{ restoreEstimation: expectedRestoreTime }],
          }),
      });

      // Mock fs.existsSync to return false (no existing restoration file)
      fs.existsSync.mockReturnValue(false);

      // Act
      await triggerRestoreArchivedFile(
        analysisId,
        file,
        target,
        token,
        mockAgent,
        mockLogger,
        restorationFile,
        options,
      );

      // Assert
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        restorationFile,
        JSON.stringify(
          [
            {
              analysisId,
              fileName,
              restoreEstimation: expectedRestoreTime,
              options,
            },
          ],
          null,
          2,
        ),
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Restoration initiated'),
      );
    });

    it('should update existing entry with same analysisId and fileName', async () => {
      // Arrange
      const analysisId = 'test-analysis-123';
      const fileName = 'test-file.bam';
      const target = 'test-target';
      const token = 'test-token';
      const restorationFile = 'test-awaiting-restoration.json';
      const expectedRestoreTime = '2024-12-25T10:00:00Z';

      const options = {
        destination: '/custom/destination',
        overwrite: false,
        range: 'chr2:5000-6000',
      };

      const file = { fileName, currentlyArchived: true };

      // Mock existing restoration file with same options
      const existingData = [
        {
          analysisId,
          fileName,
          restoreEstimation: '2024-12-24T10:00:00Z',
          options: {
            destination: '/custom/destination',
            overwrite: false,
            range: 'chr2:5000-6000',
          },
        },
      ];

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(existingData));

      // Mock the restore API endpoint
      fetchWithRetry.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            success: true,
            response: [{ restoreEstimation: expectedRestoreTime }],
          }),
      });

      // Act
      await triggerRestoreArchivedFile(
        analysisId,
        file,
        target,
        token,
        mockAgent,
        mockLogger,
        restorationFile,
        options,
      );

      // Assert - Should update existing entry, not add new one
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        restorationFile,
        JSON.stringify(
          [
            {
              analysisId,
              fileName,
              restoreEstimation: expectedRestoreTime,
              options,
            },
          ],
          null,
          2,
        ),
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Updated existing restoration entry'),
      );
    });

    it('should save filetypes correctly in restoration context', async () => {
      // Arrange
      const analysisId = 'test-analysis-filetypes';
      const fileName = 'test-file.bam';
      const target = 'test-target';
      const token = 'test-token';
      const restorationFile = 'test-awaiting-restoration.json';
      const expectedRestoreTime = '2024-12-25T10:00:00Z';

      const options = {
        destination: '/custom/destination',
        overwrite: true,
        filetypes: ['vcf.gz', 'vcf.gz.tbi'], // Test with VCF filetypes
      };

      const file = { fileName, currentlyArchived: true };

      // Mock the restore API endpoint
      fetchWithRetry.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            success: true,
            response: [{ restoreEstimation: expectedRestoreTime }],
          }),
      });

      // Mock fs.existsSync to return false (no existing restoration file)
      fs.existsSync.mockReturnValue(false);

      // Act
      await triggerRestoreArchivedFile(
        analysisId,
        file,
        target,
        token,
        mockAgent,
        mockLogger,
        restorationFile,
        options,
      );

      // Assert - Check that filetypes are preserved in the restoration context
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        restorationFile,
        JSON.stringify(
          [
            {
              analysisId,
              fileName,
              restoreEstimation: expectedRestoreTime,
              options,
            },
          ],
          null,
          2,
        ),
      );

      // Verify the options object contains filetypes
      const writtenData = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(writtenData[0].options.filetypes).toEqual([
        'vcf.gz',
        'vcf.gz.tbi',
      ]);
    });
  });

  describe('Test Case 2: Resume Successful Download', () => {
    it('should successfully resume download with restored context', async () => {
      // Arrange
      const analysisId = 'test-analysis-123';
      const fileName = 'test-file.bam';
      const target = 'test-target';
      const token = 'test-token';
      const restorationFile = 'test-awaiting-restoration.json';
      const destination = '/test/destination';

      const restoredOptions = {
        destination: '/custom/destination',
        overwrite: true,
        range: 'chr1:1000-2000',
      };

      // Mock restoration file with past restoration time
      const pastTime = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
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

      // Act
      await resumeArchivedDownloads(
        restorationFile,
        destination,
        target,
        token,
        mockAgent,
        mockLogger,
        false, // overwrite parameter
      );

      // Assert
      // Should write empty array (successful entry removed)
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        restorationFile,
        JSON.stringify([], null, 2),
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Successfully resumed download'),
      );

      // Should use restored options for destination
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Performing ranged download for restored BAM file',
        ),
      );
    });

    it('should successfully resume VCF download with restored context', async () => {
      // Arrange
      const analysisId = 'test-analysis-vcf';
      const fileName = 'test-file.vcf.gz';
      const target = 'test-target';
      const token = 'test-token';
      const restorationFile = 'test-awaiting-restoration.json';
      const destination = '/test/destination';

      const restoredOptions = {
        destination: '/custom/destination',
        overwrite: true,
        range: 'chr1:1000-2000',
        filetypes: ['vcf.gz', 'vcf.gz.tbi'], // Test VCF filetypes filter
      };

      // Mock restoration file with past restoration time
      const pastTime = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
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

      // Mock getDownloadLinks to return non-archived VCF file
      getDownloadLinks.mockResolvedValueOnce({
        [fileName]: {
          fileName,
          downloadLink: `https://${target}.varvis.com/download/${fileName}`,
          currentlyArchived: false,
        },
        [`${fileName}.tbi`]: {
          fileName: `${fileName}.tbi`,
          downloadLink: `https://${target}.varvis.com/download/${fileName}.tbi`,
          currentlyArchived: false,
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
        false, // overwrite parameter
      );

      // Assert
      // Should write empty array (successful entry removed)
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        restorationFile,
        JSON.stringify([], null, 2),
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Successfully resumed download'),
      );

      // Should use restored options for VCF ranged download
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Performing ranged download for restored VCF file',
        ),
      );

      // Verify that getDownloadLinks was called with the restored filetypes
      expect(getDownloadLinks).toHaveBeenCalledWith(
        analysisId,
        restoredOptions.filetypes, // Should use the restored filetypes filter
        target,
        token,
        mockAgent,
        mockLogger,
        'no',
        null,
        null,
        null,
      );
    });

    it('should handle full download when no ranges specified', async () => {
      // Arrange
      const analysisId = 'test-analysis-456';
      const fileName = 'test-file-full.bam';
      const target = 'test-target';
      const token = 'test-token';
      const restorationFile = 'test-awaiting-restoration.json';
      const destination = '/test/destination';

      const restoredOptions = {
        destination: '/custom/destination',
        overwrite: false,
        // No range or bed specified
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
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        restorationFile,
        JSON.stringify([], null, 2),
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Performing full download for restored BAM file',
        ),
      );
    });
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
      downloadFile.mockRejectedValueOnce(new Error('Download failed'));

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

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error during resume download'),
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
        .mockResolvedValueOnce() // Success for ready-success.bam
        .mockResolvedValueOnce() // Success for ready-success.bam.bai (index file)
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
