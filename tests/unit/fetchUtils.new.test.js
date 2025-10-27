const {
  fetchAnalysisIds,
  getDownloadLinks,
  listAvailableFiles,
  generateReport,
} = require('../../js/fetchUtils.cjs');
const {
  createMockLogger,
  createMockReadline,
} = require('../helpers/mockFactories');
const { fixtures } = require('../helpers/fixtures');
const fs = require('node:fs');
const path = require('node:path');

jest.mock('../../js/apiClient.cjs');
jest.mock('../../js/archiveUtils.cjs');

const { fetchWithRetry } = require('../../js/apiClient.cjs');
const { triggerRestoreArchivedFile } = require('../../js/archiveUtils.cjs');

describe('fetchUtils (new)', () => {
  let mockAgent;
  let mockLogger;
  const mockToken = 'test-csrf-token';
  const mockTarget = 'testenv';

  beforeEach(() => {
    mockAgent = { name: 'mockAgent' };
    mockLogger = createMockLogger();
    jest.clearAllMocks();
  });

  describe('fetchAnalysisIds', () => {
    const mockAnalyses = {
      response: [
        {
          id: 'AN001',
          sampleId: 'SAM001',
          personLimsId: 'LIMS001',
          analysisType: 'SNV',
        },
        {
          id: 'AN002',
          sampleId: 'SAM002',
          personLimsId: 'LIMS002',
          analysisType: 'CNV',
        },
        {
          id: 'AN003',
          sampleId: 'SAM003',
          personLimsId: 'LIMS003',
          analysisType: 'SNV',
        },
      ],
    };

    test('should fetch all analysis IDs and filter out CNV', async () => {
      fetchWithRetry.mockResolvedValue({
        json: async () => mockAnalyses,
      });

      const ids = await fetchAnalysisIds(
        mockTarget,
        mockToken,
        mockAgent,
        [],
        [],
        [],
        mockLogger,
      );

      expect(ids).toEqual(['AN001', 'AN003']);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Fetching all analysis IDs',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Found 2 analysis IDs after filtering.',
      );
    });

    test('should filter by sampleIds', async () => {
      fetchWithRetry.mockResolvedValue({
        json: async () => mockAnalyses,
      });

      const ids = await fetchAnalysisIds(
        mockTarget,
        mockToken,
        mockAgent,
        ['SAM001'],
        [],
        [],
        mockLogger,
      );

      expect(ids).toEqual(['AN001']);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Filtering analyses by sampleIds: SAM001',
      );
    });

    test('should filter by limsIds', async () => {
      fetchWithRetry.mockResolvedValue({
        json: async () => mockAnalyses,
      });

      const ids = await fetchAnalysisIds(
        mockTarget,
        mockToken,
        mockAgent,
        [],
        ['LIMS003'],
        [],
        mockLogger,
      );

      expect(ids).toEqual(['AN003']);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Filtering analyses by limsIds: LIMS003',
      );
    });

    test('should apply custom filters', async () => {
      fetchWithRetry.mockResolvedValue({
        json: async () => mockAnalyses,
      });

      const ids = await fetchAnalysisIds(
        mockTarget,
        mockToken,
        mockAgent,
        [],
        [],
        ['sampleId=SAM001'],
        mockLogger,
      );

      expect(ids).toEqual(['AN001']);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Applying custom filters: sampleId=SAM001',
      );
    });

    test('should log info when no analysis IDs found', async () => {
      fetchWithRetry.mockResolvedValue({
        json: async () => ({ response: [] }),
      });

      const ids = await fetchAnalysisIds(
        mockTarget,
        mockToken,
        mockAgent,
        [],
        [],
        [],
        mockLogger,
      );

      expect(ids).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'No analysis IDs found after applying filters.',
      );
    });

    test('should throw error on API failure', async () => {
      const mockError = new Error('API unavailable');
      fetchWithRetry.mockRejectedValue(mockError);

      await expect(
        fetchAnalysisIds(
          mockTarget,
          mockToken,
          mockAgent,
          [],
          [],
          [],
          mockLogger,
        ),
      ).rejects.toThrow('API unavailable');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error fetching analysis IDs:',
        mockError,
      );
    });
  });

  describe('getDownloadLinks', () => {
    const mockFileLinks = {
      response: {
        apiFileLinks: [
          {
            fileName: 'sample.vcf.gz',
            url: 'https://example.com/sample.vcf.gz',
            currentlyArchived: false,
          },
          {
            fileName: 'sample.vcf.gz.tbi',
            url: 'https://example.com/sample.vcf.gz.tbi',
            currentlyArchived: false,
          },
        ],
      },
    };

    test('should fetch download links without filter', async () => {
      fetchWithRetry.mockResolvedValue({
        json: async () => mockFileLinks,
      });

      const links = await getDownloadLinks(
        'AN001',
        null,
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
      );

      expect(Object.keys(links)).toHaveLength(2);
      expect(links['sample.vcf.gz']).toBeDefined();
      expect(links['sample.vcf.gz.tbi']).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Found 2 files for analysis ID: AN001',
      );
    });

    test('should filter files by extension', async () => {
      fetchWithRetry.mockResolvedValue({
        json: async () => mockFileLinks,
      });

      const links = await getDownloadLinks(
        'AN001',
        ['vcf.gz'],
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
      );

      expect(Object.keys(links)).toHaveLength(1);
      expect(links['sample.vcf.gz']).toBeDefined();
      expect(links['sample.vcf.gz.tbi']).toBeUndefined();
    });

    test('should log when no files found after filtering', async () => {
      fetchWithRetry.mockResolvedValue({
        json: async () => {
          return { response: { apiFileLinks: [] } };
        },
      });

      const links = await getDownloadLinks(
        'AN001',
        ['bam'],
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
      );

      expect(Object.keys(links)).toHaveLength(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'No files found for analysis ID: AN001 after applying file type filters.',
      );
    });

    test('should warn about missing file types', async () => {
      fetchWithRetry.mockResolvedValue({
        json: async () => mockFileLinks,
      });

      await getDownloadLinks(
        'AN001',
        ['bam', 'bam.bai'],
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Files with the following extensions are not available',
        ),
      );
    });

    test('should skip archived BAM file with restoreArchived=no', async () => {
      const archivedMock = {
        response: {
          apiFileLinks: [
            {
              fileName: 'sample.bam',
              url: 'https://example.com/sample.bam',
              currentlyArchived: true,
            },
          ],
        },
      };
      fetchWithRetry.mockResolvedValue({
        json: async () => archivedMock,
      });

      const links = await getDownloadLinks(
        'AN001',
        null,
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        'no',
      );

      expect(Object.keys(links)).toHaveLength(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Skipping archived file sample.bam due to --restoreArchived=no',
      );
    });

    test('should force restore archived BAM file with restoreArchived=force', async () => {
      const archivedMock = {
        response: {
          apiFileLinks: [
            {
              fileName: 'sample.bam',
              url: 'https://example.com/sample.bam',
              currentlyArchived: true,
            },
          ],
        },
      };
      fetchWithRetry.mockResolvedValue({
        json: async () => archivedMock,
      });
      triggerRestoreArchivedFile.mockResolvedValue();

      const links = await getDownloadLinks(
        'AN001',
        null,
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        'force',
      );

      expect(triggerRestoreArchivedFile).toHaveBeenCalledWith(
        'AN001',
        expect.objectContaining({ fileName: 'sample.bam' }),
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        undefined,
        undefined,
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Force restoring archived file sample.bam due to --restoreArchived=force',
      );
      expect(Object.keys(links)).toHaveLength(0);
    });

    test('should ask user for archived file with restoreArchived=ask', async () => {
      const archivedMock = {
        response: {
          apiFileLinks: [
            {
              fileName: 'sample.bam',
              url: 'https://example.com/sample.bam',
              currentlyArchived: true,
            },
          ],
        },
      };
      fetchWithRetry.mockResolvedValue({
        json: async () => archivedMock,
      });

      const mockRl = createMockReadline({
        'File sample.bam is archived. Restore it? (y/n): ': 'y',
      });
      triggerRestoreArchivedFile.mockResolvedValue();

      const links = await getDownloadLinks(
        'AN001',
        null,
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        'ask',
        mockRl,
      );

      expect(triggerRestoreArchivedFile).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'User decision for sample.bam: restore',
      );
      expect(Object.keys(links)).toHaveLength(0);
    });

    test('should handle error when fetching download links fails', async () => {
      const mockError = new Error('Network timeout');
      fetchWithRetry.mockRejectedValue(mockError);

      await expect(
        getDownloadLinks(
          'AN001',
          null,
          mockTarget,
          mockToken,
          mockAgent,
          mockLogger,
        ),
      ).rejects.toThrow('Network timeout');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get download links for analysis ID AN001: Network timeout',
      );
    });
  });

  describe('listAvailableFiles', () => {
    test('should list available files for analysis ID', async () => {
      const mockFileLinks = {
        response: {
          apiFileLinks: [
            { fileName: 'file1.vcf.gz', currentlyArchived: false },
            { fileName: 'file2.vcf.gz.tbi', currentlyArchived: false },
          ],
        },
      };
      fetchWithRetry.mockResolvedValue({
        json: async () => mockFileLinks,
      });

      await listAvailableFiles(
        'AN001',
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Listing available files for analysis ID: AN001',
      );
      expect(mockLogger.info).toHaveBeenCalledWith('- file1.vcf.gz');
      expect(mockLogger.info).toHaveBeenCalledWith('- file2.vcf.gz.tbi');
    });

    test('should handle errors when listing files', async () => {
      const mockError = new Error('API error');
      fetchWithRetry.mockRejectedValue(mockError);

      await listAvailableFiles(
        'AN001',
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to list available files for analysis ID AN001: API error',
      );
    });
  });

  describe('generateReport', () => {
    afterEach(() => {
      try {
        fs.unlinkSync('test-report.txt');
      } catch {
        // Ignore if file doesn't exist
      }
    });

    test('should generate report and log to console', () => {
      generateReport(null, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Download Summary Report'),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Total Files Processed'),
      );
    });

    test('should write report to file when reportfile is specified', () => {
      const reportPath = 'test-report.txt';
      generateReport(reportPath, mockLogger);

      expect(fs.existsSync(reportPath)).toBe(true);
      const content = fs.readFileSync(reportPath, 'utf8');
      expect(content).toContain('Download Summary Report');
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Report written to ${reportPath}`,
      );
    });
  });
});
