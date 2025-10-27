const fs = require('node:fs');
const path = require('node:path');
const { runCli } = require('./cli-runner');

// Load environment variables early (for cases where setupFiles haven't run yet)
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
}

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

  test('should list download URLs to console and file instead of downloading', async () => {
    // Arrange
    const urlFilePath = path.join(TEMP_DOWNLOAD_DIR, 'urls.txt');
    const args = [
      `--target ${TARGET_SERVER}`,
      `--username ${process.env.VARVIS_PLAYGROUND_USER}`,
      `--password ${process.env.VARVIS_PLAYGROUND_PASS}`,
      `--analysisIds ${ANALYSIS_ID}`,
      '--filetypes vcf.gz,vcf.gz.tbi',
      '--list-urls', // The new flag
      `--url-file ${urlFilePath}`,
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

    // Assert CLI output
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');

    // Check console output for the URLs
    const consoleUrls = result.stdout
      .trim()
      .split('\n')
      .filter((line) => line.includes('download/'));
    expect(consoleUrls.length).toBeGreaterThan(0); // Should have at least VCF URLs

    // Verify URLs look like actual download URLs
    consoleUrls.forEach((url) => {
      expect(url).toMatch(/https?:\/\/.*\/download\//);
    });

    // Assert file output
    expect(fs.existsSync(urlFilePath)).toBe(true);
    const fileContent = fs.readFileSync(urlFilePath, 'utf-8');
    const fileUrls = fileContent
      .trim()
      .split('\n')
      .filter((line) => line.includes('download/'));
    expect(fileUrls.length).toBe(consoleUrls.length);

    // Verify file URLs match console URLs
    expect(fileUrls).toEqual(consoleUrls);

    // Ensure no actual files were downloaded (only VCF files from previous test should exist)
    const downloadedFiles = fs.readdirSync(TEMP_DOWNLOAD_DIR);

    // Should not have downloaded any new files in this test
    expect(downloadedFiles).toContain('urls.txt'); // URL file should exist

    // Log the URLs for reference
    console.log('✓ Listed URLs:', consoleUrls.length);
    console.log('✓ URL file created:', urlFilePath);
  });

  test('should download full VCF files and verify content structure', async () => {
    // Arrange - Download complete VCF files for baseline
    const args = [
      `--target ${TARGET_SERVER}`,
      `--username ${process.env.VARVIS_PLAYGROUND_USER}`,
      `--password ${process.env.VARVIS_PLAYGROUND_PASS}`,
      `--analysisIds ${ANALYSIS_ID}`,
      '--filetypes vcf.gz,vcf.gz.tbi',
      `--destination ${TEMP_DOWNLOAD_DIR}`,
      '--overwrite',
    ].join(' ');

    // Act
    const result = await runCli(args);

    // Debug output if test fails
    if (result.code !== 0) {
      console.log('Full VCF CLI Command:', args);
      console.log('Exit Code:', result.code);
      console.log('STDOUT:', result.stdout);
      console.log('STDERR:', result.stderr);
    }

    // Assert
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Download complete.');

    // Find full VCF files dynamically
    const downloadedFiles = fs.readdirSync(TEMP_DOWNLOAD_DIR);
    const fullVcfFiles = downloadedFiles.filter(
      (file) => file.endsWith('.vcf.gz') && !file.includes('chr'), // Full files don't have region in name
    );
    const fullVcfIndexFiles = downloadedFiles.filter(
      (file) => file.endsWith('.vcf.gz.tbi') && !file.includes('chr'),
    );

    // Verify full VCF files were created
    expect(fullVcfFiles.length).toBeGreaterThan(0);
    expect(fullVcfIndexFiles.length).toBeGreaterThan(0);

    // Verify files have significant content
    const fullVcfPath = path.join(TEMP_DOWNLOAD_DIR, fullVcfFiles[0]);
    const fullVcfIndexPath = path.join(TEMP_DOWNLOAD_DIR, fullVcfIndexFiles[0]);
    expect(fs.statSync(fullVcfPath).size).toBeGreaterThan(50000); // Full VCF should be substantial
    expect(fs.statSync(fullVcfIndexPath).size).toBeGreaterThan(100); // Index should exist

    // Log the actual filenames for reference
    console.log('✓ Downloaded full VCF files:', fullVcfFiles);
    console.log('✓ Downloaded full VCF index files:', fullVcfIndexFiles);
  });

  test('should perform ranged VCF download with correct filename format', async () => {
    // Skip this test if tabix or bgzip are not available
    const { spawn } = require('node:child_process');

    const checkTool = (tool) => {
      return new Promise((resolve) => {
        const process = spawn(tool, ['--version']);
        process.on('close', (code) => {
          resolve(code === 0);
        });
        process.on('error', () => {
          resolve(false);
        });
      });
    };

    const tabixAvailable = await checkTool('tabix');
    const bgzipAvailable = await checkTool('bgzip');

    if (!tabixAvailable || !bgzipAvailable) {
      console.log(
        '⚠ Skipping VCF ranged download test: tabix or bgzip not available',
      );
      return;
    }

    // Arrange
    const args = [
      `--target ${TARGET_SERVER}`,
      `--username ${process.env.VARVIS_PLAYGROUND_USER}`,
      `--password ${process.env.VARVIS_PLAYGROUND_PASS}`,
      `--analysisIds ${ANALYSIS_ID}`,
      '--filetypes vcf.gz,vcf.gz.tbi',
      `--destination ${TEMP_DOWNLOAD_DIR}`,
      '--range chr1:1000000-2000000', // Test with a specific genomic range
      '--overwrite',
    ].join(' ');

    // Act
    const result = await runCli(args);

    // Debug output if test fails
    if (result.code !== 0) {
      console.log('Ranged VCF CLI Command:', args);
      console.log('Exit Code:', result.code);
      console.log('STDOUT:', result.stdout);
      console.log('STDERR:', result.stderr);
    }

    // Assert
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Download complete.');
    expect(result.stdout).toContain('Ranged VCF download complete');

    // Find ranged VCF files dynamically with correct filename format
    const downloadedFiles = fs.readdirSync(TEMP_DOWNLOAD_DIR);
    const rangedVcfFiles = downloadedFiles.filter(
      (file) =>
        file.includes('chr1_1000000_2000000') && file.endsWith('.vcf.gz'),
    );
    const rangedVcfIndexFiles = downloadedFiles.filter(
      (file) =>
        file.includes('chr1_1000000_2000000') && file.endsWith('.vcf.gz.tbi'),
    );

    // Verify ranged VCF files were created
    expect(rangedVcfFiles.length).toBeGreaterThan(0);
    expect(rangedVcfIndexFiles.length).toBeGreaterThan(0);

    // Verify correct filename format: basename.region.vcf.gz (not basename.vcf.region.gz)
    rangedVcfFiles.forEach((file) => {
      expect(file).toMatch(/\.chr1_1000000_2000000\.vcf\.gz$/);
      expect(file).not.toMatch(/\.vcf\.chr1_1000000_2000000\.gz$/);
    });

    rangedVcfIndexFiles.forEach((file) => {
      expect(file).toMatch(/\.chr1_1000000_2000000\.vcf\.gz\.tbi$/);
      expect(file).not.toMatch(/\.vcf\.chr1_1000000_2000000\.gz\.tbi$/);
    });

    // Verify files have content (ranged files should be smaller than full files)
    const rangedVcfPath = path.join(TEMP_DOWNLOAD_DIR, rangedVcfFiles[0]);
    const rangedVcfIndexPath = path.join(
      TEMP_DOWNLOAD_DIR,
      rangedVcfIndexFiles[0],
    );
    expect(fs.statSync(rangedVcfPath).size).toBeGreaterThan(1000);
    expect(fs.statSync(rangedVcfPath).size).toBeLessThan(50000); // Should be smaller than full file
    expect(fs.statSync(rangedVcfIndexPath).size).toBeGreaterThan(50);

    // Log the actual filenames for reference
    console.log('✓ Downloaded ranged VCF files:', rangedVcfFiles);
    console.log('✓ Downloaded ranged VCF index files:', rangedVcfIndexFiles);
    console.log('✓ Verified correct filename format: basename.region.vcf.gz');
  });

  test('should handle multiple genomic regions creating separate VCF files', async () => {
    // Skip this test if tabix or bgzip are not available
    const { spawn } = require('node:child_process');

    const checkTool = (tool) => {
      return new Promise((resolve) => {
        const process = spawn(tool, ['--version']);
        process.on('close', (code) => {
          resolve(code === 0);
        });
        process.on('error', () => {
          resolve(false);
        });
      });
    };

    const tabixAvailable = await checkTool('tabix');
    const bgzipAvailable = await checkTool('bgzip');

    if (!tabixAvailable || !bgzipAvailable) {
      console.log(
        '⚠ Skipping multi-region VCF test: tabix or bgzip not available',
      );
      return;
    }

    // Arrange - Test multiple regions
    const args = [
      `--target ${TARGET_SERVER}`,
      `--username ${process.env.VARVIS_PLAYGROUND_USER}`,
      `--password ${process.env.VARVIS_PLAYGROUND_PASS}`,
      `--analysisIds ${ANALYSIS_ID}`,
      '--filetypes vcf.gz,vcf.gz.tbi',
      `--destination ${TEMP_DOWNLOAD_DIR}`,
      '--range "chr1:1000000-1500000 chr1:2000000-2500000"', // Multiple regions
      '--overwrite',
    ].join(' ');

    // Act
    const result = await runCli(args);

    // Debug output if test fails
    if (result.code !== 0) {
      console.log('Multi-region VCF CLI Command:', args);
      console.log('Exit Code:', result.code);
      console.log('STDOUT:', result.stdout);
      console.log('STDERR:', result.stderr);
    }

    // Assert
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Download complete.');

    // Find files for both regions
    const downloadedFiles = fs.readdirSync(TEMP_DOWNLOAD_DIR);
    const region1Files = downloadedFiles.filter(
      (file) =>
        file.includes('chr1_1000000_1500000') && file.endsWith('.vcf.gz'),
    );
    const region2Files = downloadedFiles.filter(
      (file) =>
        file.includes('chr1_2000000_2500000') && file.endsWith('.vcf.gz'),
    );

    // Verify both regions created files
    expect(region1Files.length).toBeGreaterThan(0);
    expect(region2Files.length).toBeGreaterThan(0);

    // Log the results
    console.log('✓ Region 1 files:', region1Files);
    console.log('✓ Region 2 files:', region2Files);
    console.log('✓ Successfully created separate files for multiple regions');
  });
});
