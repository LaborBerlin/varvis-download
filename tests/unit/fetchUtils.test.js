const { getDownloadLinks } = require("../../js/fetchUtils");
const { fetchWithRetry } = require("../../js/apiClient");
const { triggerRestoreArchivedFile } = require("../../js/archiveUtils");

// Mock dependencies
jest.mock("../../js/apiClient");
jest.mock("../../js/archiveUtils");

describe("fetchUtils", () => {
  let mockLogger;
  let mockAgent;

  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    // Create mock agent
    mockAgent = {};

    jest.clearAllMocks();
  });

  describe("getDownloadLinks - file extension filtering", () => {
    const mockAnalysisId = "12345";
    const mockTarget = "test";
    const mockToken = "csrf-token";

    beforeEach(() => {
      // Mock successful API response with various file types
      fetchWithRetry.mockResolvedValue({
        json: () =>
          Promise.resolve({
            response: {
              apiFileLinks: [
                {
                  fileName: "sample.bam",
                  downloadLink: "https://example.com/sample.bam",
                  currentlyArchived: false,
                },
                {
                  fileName: "sample.bam.bai",
                  downloadLink: "https://example.com/sample.bam.bai",
                  currentlyArchived: false,
                },
                {
                  fileName: "sample.vcf.gz",
                  downloadLink: "https://example.com/sample.vcf.gz",
                  currentlyArchived: false,
                },
                {
                  fileName: "sample.vcf.gz.tbi",
                  downloadLink: "https://example.com/sample.vcf.gz.tbi",
                  currentlyArchived: false,
                },
                {
                  fileName: "sample.fastq.gz",
                  downloadLink: "https://example.com/sample.fastq.gz",
                  currentlyArchived: false,
                },
                {
                  fileName: "report.pdf",
                  downloadLink: "https://example.com/report.pdf",
                  currentlyArchived: false,
                },
              ],
            },
          }),
      });
    });

    test("should correctly filter BAM files with compound extensions", async () => {
      const filter = ["bam", "bam.bai"];

      const result = await getDownloadLinks(
        mockAnalysisId,
        filter,
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        "no",
      );

      expect(Object.keys(result)).toHaveLength(2);
      expect(result["sample.bam"]).toBeDefined();
      expect(result["sample.bam.bai"]).toBeDefined();
      expect(result["sample.vcf.gz"]).toBeUndefined();
    });

    test("should correctly filter VCF files with compound extensions", async () => {
      const filter = ["vcf.gz", "vcf.gz.tbi"];

      const result = await getDownloadLinks(
        mockAnalysisId,
        filter,
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        "no",
      );

      expect(Object.keys(result)).toHaveLength(2);
      expect(result["sample.vcf.gz"]).toBeDefined();
      expect(result["sample.vcf.gz.tbi"]).toBeDefined();
      expect(result["sample.bam"]).toBeUndefined();
    });

    test("should correctly filter mixed file types", async () => {
      const filter = ["bam", "vcf.gz", "pdf"];

      const result = await getDownloadLinks(
        mockAnalysisId,
        filter,
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        "no",
      );

      expect(Object.keys(result)).toHaveLength(3);
      expect(result["sample.bam"]).toBeDefined();
      expect(result["sample.vcf.gz"]).toBeDefined();
      expect(result["report.pdf"]).toBeDefined();
      expect(result["sample.bam.bai"]).toBeUndefined();
      expect(result["sample.vcf.gz.tbi"]).toBeUndefined();
    });

    test("should return all files when no filter is provided", async () => {
      const result = await getDownloadLinks(
        mockAnalysisId,
        null,
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        "no",
      );

      expect(Object.keys(result)).toHaveLength(6);
      expect(result["sample.bam"]).toBeDefined();
      expect(result["sample.bam.bai"]).toBeDefined();
      expect(result["sample.vcf.gz"]).toBeDefined();
      expect(result["sample.vcf.gz.tbi"]).toBeDefined();
      expect(result["sample.fastq.gz"]).toBeDefined();
      expect(result["report.pdf"]).toBeDefined();
    });

    test("should return all files when empty filter array is provided", async () => {
      const result = await getDownloadLinks(
        mockAnalysisId,
        [],
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        "no",
      );

      expect(Object.keys(result)).toHaveLength(6);
    });

    test("should warn about missing file types using new logic", async () => {
      const filter = ["vcf.gz.tbi", "missing.type"];

      const result = await getDownloadLinks(
        mockAnalysisId,
        filter,
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        "no",
      );

      expect(result["sample.vcf.gz.tbi"]).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Warning: Files with the following extensions are not available for analysis 12345: missing.type",
      );
    });

    test("should handle partial extension matches correctly", async () => {
      // Test that 'gz' matches all .gz files (this is the correct behavior)
      const filter = ["gz"];

      const result = await getDownloadLinks(
        mockAnalysisId,
        filter,
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        "no",
      );

      // Should match both sample.fastq.gz and sample.vcf.gz since both end with 'gz'
      expect(Object.keys(result)).toHaveLength(2);
      expect(result["sample.fastq.gz"]).toBeDefined();
      expect(result["sample.vcf.gz"]).toBeDefined();
    });

    test("should handle case-sensitive extensions", async () => {
      // Add a file with different case
      fetchWithRetry.mockResolvedValue({
        json: () =>
          Promise.resolve({
            response: {
              apiFileLinks: [
                {
                  fileName: "sample.BAM",
                  downloadLink: "https://example.com/sample.BAM",
                  currentlyArchived: false,
                },
                {
                  fileName: "sample.bam",
                  downloadLink: "https://example.com/sample.bam",
                  currentlyArchived: false,
                },
              ],
            },
          }),
      });

      const filter = ["bam"];

      const result = await getDownloadLinks(
        mockAnalysisId,
        filter,
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        "no",
      );

      // Should only match lowercase 'bam'
      expect(Object.keys(result)).toHaveLength(1);
      expect(result["sample.bam"]).toBeDefined();
      expect(result["sample.BAM"]).toBeUndefined();
    });
  });

  describe("getDownloadLinks - archived file handling", () => {
    const mockAnalysisId = "12345";
    const mockTarget = "test";
    const mockToken = "csrf-token";

    test("should skip archived BAM files", async () => {
      fetchWithRetry.mockResolvedValue({
        json: () =>
          Promise.resolve({
            response: {
              apiFileLinks: [
                {
                  fileName: "archived.bam",
                  downloadLink: "https://example.com/archived.bam",
                  currentlyArchived: true,
                },
                {
                  fileName: "available.bam",
                  downloadLink: "https://example.com/available.bam",
                  currentlyArchived: false,
                },
              ],
            },
          }),
      });

      const filter = ["bam"];

      const result = await getDownloadLinks(
        mockAnalysisId,
        filter,
        mockTarget,
        mockToken,
        mockAgent,
        mockLogger,
        "no",
      );

      expect(Object.keys(result)).toHaveLength(1);
      expect(result["available.bam"]).toBeDefined();
      expect(result["archived.bam"]).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "File archived.bam for analysis 12345 is archived.",
      );
    });
  });
});
