# Basic Usage Examples

This page provides practical examples for common Varvis Download CLI use cases.

## Essential Downloads

### Download Single Analysis

Download BAM files for one analysis:

```bash
./varvis-download.js -t laborberlin -a 12345
```

This downloads:

- `[sample-name].bam`
- `[sample-name].bam.bai`

### Download Multiple Analyses

Download files for several analyses:

```bash
./varvis-download.js -t laborberlin -a "12345,67890,11111"
```

### Download Specific File Types

Download only VCF files:

```bash
./varvis-download.js -t laborberlin -a 12345 -f "vcf.gz,vcf.gz.tbi"
```

Available file types:

- `bam` - Binary Alignment Map files
- `bam.bai` - BAM index files
- `vcf.gz` - Compressed Variant Call Format files
- `vcf.gz.tbi` - VCF index files

### Download to Custom Directory

Organize downloads by creating target directories:

```bash
# Create directory structure
mkdir -p ./data/analysis_12345

# Download to specific location
./varvis-download.js -t laborberlin -a 12345 -d "./data/analysis_12345"
```

## Authentication Examples

### Environment Variables (Recommended)

```bash
# Set credentials once
export VARVIS_USER="your_username"
export VARVIS_PASSWORD="your_password"

# Run without credential arguments
./varvis-download.js -t laborberlin -a 12345
```

### Interactive Password Prompt

If no password is provided, the tool will prompt securely:

```bash
./varvis-download.js -t laborberlin -u your_username -a 12345
# Output: Please enter your Varvis password: [hidden input]
```

### Configuration File

Create `.config.json`:

```json
{
  "username": "your_username",
  "target": "laborberlin",
  "destination": "./downloads",
  "filetypes": ["bam", "bam.bai", "vcf.gz"],
  "loglevel": "info"
}
```

Then run with minimal arguments:

```bash
./varvis-download.js -a 12345
```

## File Management Examples

### Preview Before Download

List available files without downloading:

```bash
./varvis-download.js -t laborberlin -a 12345 --list
```

Example output:

```
Analysis ID: 12345
Available files:
  - sample_001.bam (1.2 GB)
  - sample_001.bam.bai (4.5 MB)
  - sample_001.vcf.gz (125 MB)
  - sample_001.vcf.gz.tbi (2.1 MB)
```

### Generate Download URLs

Get direct download URLs for external tools:

```bash
# Print URLs to console
./varvis-download.js -t laborberlin -a 12345 --list-urls

# Save URLs to file
./varvis-download.js -t laborberlin -a 12345 --list-urls --url-file download_urls.txt

# Use with external download tools
./varvis-download.js -t laborberlin -a 12345 --list-urls | wget -i -
./varvis-download.js -t laborberlin -a 12345 --list-urls | aria2c -i -
```

Example URL output:

```
https://laborberlin.varvis.com/download/analysis/12345/sample_001.bam?token=abc123
https://laborberlin.varvis.com/download/analysis/12345/sample_001.bam.bai?token=abc123
https://laborberlin.varvis.com/download/analysis/12345/sample_001.vcf.gz?token=abc123
https://laborberlin.varvis.com/download/analysis/12345/sample_001.vcf.gz.tbi?token=abc123
```

### Overwrite Existing Files

By default, existing files are skipped. To overwrite:

```bash
./varvis-download.js -t laborberlin -a 12345 --overwrite
```

### Custom File Selection

Download only specific file patterns:

```bash
# Only BAM files (no indexes)
./varvis-download.js -t laborberlin -a 12345 -f "bam"

# Only index files
./varvis-download.js -t laborberlin -a 12345 -f "bam.bai,vcf.gz.tbi"
```

## Search and Discovery

### Find Analyses by Sample ID

Download all analyses for specific samples:

```bash
./varvis-download.js -t laborberlin -s "LB24-001,LB24-002"
```

### Find Analyses by LIMS ID

Use laboratory information management system IDs:

```bash
./varvis-download.js -t laborberlin -l "LIMS_123,LIMS_456"
```

### Combine Search Methods

Use multiple identification methods:

```bash
./varvis-download.js -t laborberlin -s "LB24-001" -l "LIMS_123" -a "12345"
```

## Logging and Monitoring

### Basic Logging

Set log level for detailed output:

```bash
./varvis-download.js -t laborberlin -a 12345 --loglevel debug
```

Log levels:

- `error` - Only errors
- `warn` - Warnings and errors
- `info` - General information (default)
- `debug` - Detailed debugging

### Save Logs to File

Capture logs for later analysis:

```bash
./varvis-download.js -t laborberlin -a 12345 --logfile "./logs/download_$(date +%Y%m%d).log"
```

### Generate Download Report

Create detailed download report:

```bash
./varvis-download.js -t laborberlin -a 12345 --reportfile "./reports/analysis_12345_report.json"
```

Report includes:

- Download statistics
- File sizes and checksums
- Timing information
- Error details

## Error Handling

### Basic Error Recovery

The tool automatically retries failed downloads:

```bash
# Will retry up to 3 times for network errors
./varvis-download.js -t laborberlin -a 12345
```

### Handle Missing Files

Some analyses may not have all file types:

```bash
# This will skip missing file types gracefully
./varvis-download.js -t laborberlin -a 12345 -f "bam,bam.bai,vcf.gz,vcf.gz.tbi"
```

### Debug Connection Issues

For network troubleshooting:

```bash
./varvis-download.js -t laborberlin -a 12345 --loglevel debug --logfile debug.log
```

## Batch Operations

### Download Multiple Targets

Process different Varvis instances:

```bash
# Download from labor berlin
./varvis-download.js -t laborberlin -a "12345,67890" -d "./laborberlin/"

# Download from university leipzig
./varvis-download.js -t uni-leipzig -a "11111,22222" -d "./uni-leipzig/"
```

### Organized Directory Structure

Create organized downloads:

```bash
#!/bin/bash
ANALYSES=("12345" "67890" "11111")

for ANALYSIS in "${ANALYSES[@]}"; do
    echo "Downloading analysis: $ANALYSIS"
    mkdir -p "./data/analysis_$ANALYSIS"
    ./varvis-download.js -t laborberlin -a "$ANALYSIS" -d "./data/analysis_$ANALYSIS"
done
```

### Process Sample Lists

Download all analyses for a sample list:

```bash
#!/bin/bash
# samples.txt contains one sample ID per line
while IFS= read -r SAMPLE; do
    echo "Processing sample: $SAMPLE"
    ./varvis-download.js -t laborberlin -s "$SAMPLE" -d "./data/$SAMPLE/"
done < samples.txt
```

## Performance Optimization

### Concurrent Downloads

The tool automatically downloads multiple files in parallel. Monitor system resources:

```bash
# Monitor during large downloads
htop
# or
iostat -x 1
```

### Disk Space Management

Check available space before large downloads:

```bash
# Check available space
df -h .

# Download with size awareness
./varvis-download.js -t laborberlin -a 12345 --list | grep -E "GB|TB"
```

### Network Optimization

For slow connections, use smaller file types first:

```bash
# Download indexes first (small files)
./varvis-download.js -t laborberlin -a 12345 -f "bam.bai,vcf.gz.tbi"

# Then download data files
./varvis-download.js -t laborberlin -a 12345 -f "bam,vcf.gz"
```

## Genomic Range Downloads

### VCF Range Extraction

Extract specific genomic regions from VCF files:

```bash
# Extract a single region with proper file naming
./varvis-download.js -t laborberlin -a 12345 -g "chr1:155000000-156000000" -f "vcf.gz,vcf.gz.tbi"
# Creates: sample.chr1_155000000_156000000.vcf.gz

# Extract multiple regions (creates separate files)
./varvis-download.js -t laborberlin -a 12345 -g "chr1:155000000-156000000 chr17:41000000-42000000" -f "vcf.gz,vcf.gz.tbi"
# Creates: sample.chr1_155000000_156000000.vcf.gz, sample.chr17_41000000_42000000.vcf.gz

# Use BED file for complex regions
echo -e "chr1\t155000000\t156000000\tchr17\t41000000\t42000000" > regions.bed
./varvis-download.js -t laborberlin -a 12345 -b regions.bed -f "vcf.gz,vcf.gz.tbi"
```

### BAM Range Extraction

Extract specific regions from BAM files:

```bash
# Extract a genomic region from BAM files
./varvis-download.js -t laborberlin -a 12345 -g "chr1:155000000-156000000" -f "bam,bam.bai"

# Multiple regions with BED file
./varvis-download.js -t laborberlin -a 12345 -b target_regions.bed -f "bam,bam.bai"
```

### Range Download Requirements

**For VCF files**:
- Requires `tabix` v1.7+ and `bgzip` v1.7+
- Automatically downloads `.tbi` index files
- Uses `tabix -h | bgzip` pipeline for proper VCF format

**For BAM files**:
- Requires `samtools` v1.17+
- Automatically downloads `.bai` index files
- Uses `samtools view -b` for region extraction

## Next Steps

- **[Advanced Filtering](/examples/filtering)** - Complex search expressions
- **[Genomic Ranges](/examples/ranges)** - Targeted downloads
- **[Automation Scripts](/examples/automation)** - CI/CD integration

## Common Patterns

### Daily Download Script

```bash
#!/bin/bash
# daily_download.sh
export VARVIS_USER="${VARVIS_USER}"
export VARVIS_PASSWORD="${VARVIS_PASSWORD}"

DATE=$(date +%Y%m%d)
LOG_DIR="./logs"
DATA_DIR="./data/$DATE"

mkdir -p "$LOG_DIR" "$DATA_DIR"

./varvis-download.js \
  -t laborberlin \
  -s "$(cat today_samples.txt | tr '\n' ',')" \
  -d "$DATA_DIR" \
  --logfile "$LOG_DIR/download_$DATE.log" \
  --reportfile "$LOG_DIR/report_$DATE.json"
```

### Verification Script

```bash
#!/bin/bash
# verify_downloads.sh
ANALYSIS="12345"
DATA_DIR="./data/analysis_$ANALYSIS"

# List expected files
./varvis-download.js -t laborberlin -a "$ANALYSIS" --list > expected_files.txt

# Check if all files exist
while IFS= read -r FILE; do
    if [[ -f "$DATA_DIR/$FILE" ]]; then
        echo "✓ $FILE"
    else
        echo "✗ Missing: $FILE"
    fi
done < <(grep -o '[^/]*\.(bam|bai|vcf\.gz|tbi)' expected_files.txt)
```
