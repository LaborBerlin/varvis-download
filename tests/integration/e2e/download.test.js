const fs = require('fs');
const path = require('path');
const { runCli } = require('./cli-runner');

const TEMP_DOWNLOAD_DIR = path.resolve(__dirname, 'temp_downloads');
const TARGET_SERVER = 'playground';
const ANALYSIS_ID = '30';
// Note: Actual filenames will be determined dynamically from download output

describe('E2E Integration Tests against Varvis Playground', () => {
  // Check for credentials before running any tests
  beforeAll(() => {
    if (
      !process.env.VARVIS_PLAYGROUND_USER ||
      !process.env.VARVIS_PLAYGROUND_PASS
    ) {
      throw new Error(
        'Playground credentials not found in environment variables. Please set VARVIS_PLAYGROUND_USER and VARVIS_PLAYGROUND_PASS.',
      );
    }
    // Create temp directory for downloads
    if (fs.existsSync(TEMP_DOWNLOAD_DIR)) {
      fs.rmSync(TEMP_DOWNLOAD_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEMP_DOWNLOAD_DIR, { recursive: true });
  });

  // Clean up downloaded files after all tests
  afterAll(() => {
    if (fs.existsSync(TEMP_DOWNLOAD_DIR)) {
      fs.rmSync(TEMP_DOWNLOAD_DIR, { recursive: true, force: true });
    }
  });

  test('should download VCF and its index file successfully', async () => {
    // Arrange
    const args = [
      `--target ${TARGET_SERVER}`,
      `--username ${process.env.VARVIS_PLAYGROUND_USER}`,
      `--password ${process.env.VARVIS_PLAYGROUND_PASS}`,
      `--analysisIds ${ANALYSIS_ID}`,
      '--filetypes vcf.gz,vcf.gz.tbi',
      `--destination ${TEMP_DOWNLOAD_DIR}`,
      '--overwrite', // Ensure tests are repeatable
    ].join(' ');

    // Act
    const result = await runCli(args);

    // Debug output if test fails
    if (result.code !== 0) {
      console.log('CLI Command:', args);
      console.log('Exit Code:', result.code);
      console.log('STDOUT:', result.stdout);
      console.log('STDERR:', result.stderr);
    }

    // Assert
    expect(result.code).toBe(0); // Success exit code
    expect(result.stdout).toContain('Download complete.');

    // Find downloaded VCF files dynamically
    const downloadedFiles = fs.readdirSync(TEMP_DOWNLOAD_DIR);
    const vcfFiles = downloadedFiles.filter((file) => file.endsWith('.vcf.gz'));
    const vcfIndexFiles = downloadedFiles.filter((file) =>
      file.endsWith('.vcf.gz.tbi'),
    );

    // Verify VCF files were created
    expect(vcfFiles.length).toBeGreaterThan(0);
    expect(vcfIndexFiles.length).toBeGreaterThan(0);

    // Verify files have content
    const vcfPath = path.join(TEMP_DOWNLOAD_DIR, vcfFiles[0]);
    const vcfIndexPath = path.join(TEMP_DOWNLOAD_DIR, vcfIndexFiles[0]);
    expect(fs.statSync(vcfPath).size).toBeGreaterThan(1000);
    expect(fs.statSync(vcfIndexPath).size).toBeGreaterThan(100);

    // Log the actual filenames for reference
    console.log('✓ Downloaded VCF files:', vcfFiles);
    console.log('✓ Downloaded VCF index files:', vcfIndexFiles);
  });
});
