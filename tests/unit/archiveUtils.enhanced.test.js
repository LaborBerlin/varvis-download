const {
  triggerRestoreArchivedFile,
  appendToAwaitingRestoration,
  resumeArchivedDownloads,
} = require('../../js/archiveUtils.cjs');
const { createMockLogger } = require('../helpers/mockFactories');
const fs = require('node:fs');

jest.mock('../../js/apiClient.cjs');
jest.mock('../../js/fetchUtils.cjs');
jest.mock('../../js/rangedUtils.cjs');
jest.mock('../../js/fileUtils.cjs');
jest.mock('node:fs');

const { fetchWithRetry } = require('../../js/apiClient.cjs');
const { getDownloadLinks } = require('../../js/fetchUtils.cjs');
const { downloadFile } = require('../../js/fileUtils.cjs');
const {
  ensureIndexFile,
  generateOutputFileName,
  indexBAM,
  indexVCF,
} = require('../../js/rangedUtils.cjs');

describe('archiveUtils (enhanced)', () => {
  let mockLogger;
  const mockAgent = { name: 'mockAgent' };
  const mockToken = 'test-token';
  const mockTarget = 'testenv';

  beforeEach(() => {
    mockLogger = createMockLogger();
    jest.clearAllMocks();
  });

  describe('triggerRestoreArchivedFile', () => {
    test('should handle restore failure gracefully', async () => {
      fetchWithRetry.mockResolvedValue({
        json: async () => ({
          success: false,
          errorMessageId: 'RESTORE_ERROR',
        }),
      });

      await triggerRestoreArchivedFile(
        'AN001',
        { fileName: 'sample.bam' },
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        'test-restoration.json',
        {},
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initiate restoration for analysis AN001: RESTORE_ERROR',
      );
    });

    test('should handle API error during restoration', async () => {
      const mockError = new Error('API unavailable');
      fetchWithRetry.mockRejectedValue(mockError);

      await triggerRestoreArchivedFile(
        'AN001',
        { fileName: 'sample.bam' },
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        'test-restoration.json',
        {},
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error triggering restoration for analysis AN001: API unavailable',
      );
    });
  });

  describe('appendToAwaitingRestoration', () => {
    test('should handle corrupt JSON file gracefully', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{ invalid json');

      await appendToAwaitingRestoration(
        {
          analysisId: 'AN001',
          fileName: 'sample.bam',
          restoreEstimation: '2025-01-01',
          options: {},
        },
        mockLogger,
        'test-restoration.json',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to parse awaiting-restoration file. Starting fresh.',
      );
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('resumeArchivedDownloads', () => {
    test('should handle missing restoration file', async () => {
      fs.existsSync.mockReturnValue(false);

      await resumeArchivedDownloads(
        'missing-restoration.json',
        './downloads',
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        false,
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'No restoration file found at missing-restoration.json. Nothing to resume.',
      );
    });

    test('should handle corrupt restoration file', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{ invalid json');

      await resumeArchivedDownloads(
        'corrupt-restoration.json',
        './downloads',
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        false,
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error reading restoration file'),
      );
    });

    test('should handle empty restoration file', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('[]');

      await resumeArchivedDownloads(
        'empty-restoration.json',
        './downloads',
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        false,
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Restoration file is empty. Nothing to resume.',
      );
    });

    test('should handle file still archived scenario', async () => {
      const mockData = [
        {
          analysisId: 'AN001',
          fileName: 'sample.bam',
          restoreEstimation: '2025-01-01T00:00:00Z',
          options: {},
        },
      ];

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockData));

      getDownloadLinks.mockResolvedValue({
        'sample.bam': {
          fileName: 'sample.bam',
          downloadLink: 'https://example.com/sample.bam',
          currentlyArchived: true,
        },
      });

      await resumeArchivedDownloads(
        'test-restoration.json',
        './downloads',
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        false,
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'File sample.bam is still archived for analysis AN001. Keeping for retry.',
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'test-restoration.json',
        expect.stringContaining('AN001'),
      );
    });

    test('should handle file not found in download links', async () => {
      const mockData = [
        {
          analysisId: 'AN001',
          fileName: 'missing.bam',
          restoreEstimation: '2025-01-01T00:00:00Z',
          options: {},
        },
      ];

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockData));

      getDownloadLinks.mockResolvedValue({});

      await resumeArchivedDownloads(
        'test-restoration.json',
        './downloads',
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        false,
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'File missing.bam not found or still archived for analysis AN001. Keeping for retry.',
      );
    });

    test('should handle BED file read error during resume', async () => {
      const mockData = [
        {
          analysisId: 'AN001',
          fileName: 'sample.bam',
          restoreEstimation: '2025-01-01T00:00:00Z',
          options: {
            bed: '/invalid/path.bed',
          },
        },
      ];

      fs.existsSync.mockImplementation((path) => {
        if (path === 'test-restoration.json') return true;
        if (path === '/invalid/path.bed') return false;
        return false;
      });

      fs.readFileSync.mockImplementation((path) => {
        if (path === 'test-restoration.json') return JSON.stringify(mockData);
        throw new Error('File not found');
      });

      getDownloadLinks.mockResolvedValue({
        'sample.bam': {
          fileName: 'sample.bam',
          downloadLink: 'https://example.com/sample.bam',
          currentlyArchived: false,
        },
      });

      generateOutputFileName.mockReturnValue('sample.bam');
      downloadFile.mockResolvedValue();

      await resumeArchivedDownloads(
        'test-restoration.json',
        './downloads',
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        false,
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error reading BED file'),
      );
    });

    test('should handle missing BAM index file for ranged download', async () => {
      const mockData = [
        {
          analysisId: 'AN001',
          fileName: 'sample.bam',
          restoreEstimation: '2025-01-01T00:00:00Z',
          options: {
            range: 'chr1:1000-2000',
          },
        },
      ];

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockData));

      getDownloadLinks.mockResolvedValue({
        'sample.bam': {
          fileName: 'sample.bam',
          downloadLink: 'https://example.com/sample.bam',
          currentlyArchived: false,
        },
        // Note: Deliberately not including sample.bam.bai to test missing index
      });

      generateOutputFileName.mockReturnValue('sample.bam');

      await resumeArchivedDownloads(
        'test-restoration.json',
        './downloads',
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        false,
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Index file for BAM sample.bam not found for analysis AN001',
        ),
      );
    });

    test('should handle missing VCF index file for ranged download', async () => {
      const mockData = [
        {
          analysisId: 'AN001',
          fileName: 'sample.vcf.gz',
          restoreEstimation: '2025-01-01T00:00:00Z',
          options: {
            range: 'chr1:1000-2000',
          },
        },
      ];

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockData));

      getDownloadLinks.mockResolvedValue({
        'sample.vcf.gz': {
          fileName: 'sample.vcf.gz',
          downloadLink: 'https://example.com/sample.vcf.gz',
          currentlyArchived: false,
        },
        // Note: Deliberately not including sample.vcf.gz.tbi to test missing index
      });

      generateOutputFileName.mockReturnValue('sample.vcf.gz');

      await resumeArchivedDownloads(
        'test-restoration.json',
        './downloads',
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        false,
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Index file for VCF sample.vcf.gz not found for analysis AN001',
        ),
      );
    });

    test('should handle full VCF download with optional index', async () => {
      const mockData = [
        {
          analysisId: 'AN001',
          fileName: 'sample.vcf.gz',
          restoreEstimation: '2025-01-01T00:00:00Z',
          options: {},
        },
      ];

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockData));

      getDownloadLinks.mockResolvedValue({
        'sample.vcf.gz': {
          fileName: 'sample.vcf.gz',
          downloadLink: 'https://example.com/sample.vcf.gz',
          currentlyArchived: false,
        },
        'sample.vcf.gz.tbi': {
          fileName: 'sample.vcf.gz.tbi',
          downloadLink: 'https://example.com/sample.vcf.gz.tbi',
          currentlyArchived: false,
        },
      });

      generateOutputFileName.mockReturnValue('sample.vcf.gz');
      downloadFile.mockResolvedValue();
      indexVCF.mockResolvedValue();

      await resumeArchivedDownloads(
        'test-restoration.json',
        './downloads',
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        false,
      );

      expect(downloadFile).toHaveBeenCalledWith(
        'https://example.com/sample.vcf.gz',
        expect.any(String),
        false,
        mockAgent,
        null,
        mockLogger,
        expect.any(Object),
      );
      expect(indexVCF).toHaveBeenCalled();
    });

    test('should handle index file download failure gracefully', async () => {
      const mockData = [
        {
          analysisId: 'AN001',
          fileName: 'sample.bam',
          restoreEstimation: '2025-01-01T00:00:00Z',
          options: {},
        },
      ];

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockData));

      getDownloadLinks.mockResolvedValue({
        'sample.bam': {
          fileName: 'sample.bam',
          downloadLink: 'https://example.com/sample.bam',
          currentlyArchived: false,
        },
        'sample.bam.bai': {
          fileName: 'sample.bam.bai',
          downloadLink: 'https://example.com/sample.bam.bai',
          currentlyArchived: false,
        },
      });

      generateOutputFileName.mockReturnValue('sample.bam');
      downloadFile
        .mockResolvedValueOnce() // First call succeeds (BAM file)
        .mockRejectedValueOnce(new Error('Index download failed')); // Second call fails (index)
      indexBAM.mockResolvedValue();

      await resumeArchivedDownloads(
        'test-restoration.json',
        './downloads',
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        false,
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to download index file sample.bam.bai: Index download failed',
      );
      expect(indexBAM).toHaveBeenCalled(); // Should still index the BAM
    });

    test('should handle non-BAM non-VCF file types', async () => {
      const mockData = [
        {
          analysisId: 'AN001',
          fileName: 'sample.txt',
          restoreEstimation: '2025-01-01T00:00:00Z',
          options: {},
        },
      ];

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockData));

      getDownloadLinks.mockResolvedValue({
        'sample.txt': {
          fileName: 'sample.txt',
          downloadLink: 'https://example.com/sample.txt',
          currentlyArchived: false,
        },
      });

      generateOutputFileName.mockReturnValue('sample.txt');
      downloadFile.mockResolvedValue();

      await resumeArchivedDownloads(
        'test-restoration.json',
        './downloads',
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        false,
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Performing download for restored file: sample.txt',
      );
      expect(downloadFile).toHaveBeenCalled();
    });
  });
});
