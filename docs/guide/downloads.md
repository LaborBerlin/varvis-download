# File Downloads

Master the file download capabilities of Varvis Download CLI, including file type selection, output management, and performance optimization.

## File Types Overview

### Supported File Formats

| Extension     | Description                    | Size Range   | Index Required |
| ------------- | ------------------------------ | ------------ | -------------- |
| `.bam`        | Binary Alignment Map           | 100MB - 50GB | `.bam.bai`     |
| `.bam.bai`    | BAM Index                      | 1MB - 100MB  | No             |
| `.vcf.gz`     | Compressed Variant Call Format | 10MB - 5GB   | `.vcf.gz.tbi`  |
| `.vcf.gz.tbi` | VCF Tabix Index                | 100KB - 50MB | No             |

### File Type Selection

**Default behavior** (BAM workflow):

```bash
./varvis-download.js -t laborberlin -a 12345
# Downloads: .bam and .bam.bai files
```

**Specific file types**:

```bash
# VCF workflow only
./varvis-download.js -t laborberlin -a 12345 -f "vcf.gz,vcf.gz.tbi"

# All genomic data
./varvis-download.js -t laborberlin -a 12345 -f "bam,bam.bai,vcf.gz,vcf.gz.tbi"

# Data files only (no indexes)
./varvis-download.js -t laborberlin -a 12345 -f "bam,vcf.gz"
```

## Output Management

### Directory Structure

**Basic organization**:

```bash
# Download to current directory
./varvis-download.js -t laborberlin -a 12345

# Download to specific directory
./varvis-download.js -t laborberlin -a 12345 -d "./genomics-data"

# Organized by analysis
./varvis-download.js -t laborberlin -a 12345 -d "./data/analysis_12345"
```

**Resulting structure**:

```
./genomics-data/
├── sample_001.bam
├── sample_001.bam.bai
├── sample_002.bam
└── sample_002.bam.bai
```

### File Naming Conventions

**Standard naming**:

- Original Varvis filenames are preserved
- Analysis metadata included in names
- Timestamp information maintained

**Range download naming**:

```bash
# Single range
./varvis-download.js -t laborberlin -a 12345 -g "chr1:1000000-2000000"
# Output: sample_001.chr1_1000000_2000000.bam

# Multiple ranges
./varvis-download.js -t laborberlin -a 12345 -g "chr1:1-1000 chr2:1-1000"
# Output: sample_001.multiple-regions.bam

# BED file ranges
./varvis-download.js -t laborberlin -a 12345 -b regions.bed
# Output: sample_001.multiple-regions.bam
```

### Overwrite Behavior

**Default behavior** (skip existing):

```bash
./varvis-download.js -t laborberlin -a 12345
# Skips files that already exist
```

**Force overwrite**:

```bash
./varvis-download.js -t laborberlin -a 12345 --overwrite
# Overwrites existing files
```

**Smart overwrite checking**:

- Compares file sizes
- Checks modification dates
- Validates file integrity

## Download Modes

### Preview Mode

List available files without downloading:

```bash
./varvis-download.js -t laborberlin -a 12345 --list
```

**Example output**:

```
Analysis ID: 12345
Sample: LB24-001
Available files:
  ✓ LB24-001-ready.bam (1.2 GB)
  ✓ LB24-001-ready.bam.bai (4.5 MB)
  ✓ LB24-001-ready.vcf.gz (125 MB)
  ✓ LB24-001-ready.vcf.gz.tbi (2.1 MB)
  ⚠ LB24-001-backup.bam (archived)

Total size: 1.33 GB
Available immediately: 1.33 GB
Requires restoration: 2.1 GB
```

### Full Download Mode

Download complete files:

```bash
# Single analysis
./varvis-download.js -t laborberlin -a 12345

# Multiple analyses
./varvis-download.js -t laborberlin -a "12345,67890,11111"

# Progress output
./varvis-download.js -t laborberlin -a 12345
```

**Progress display**:

```
Analysis 12345: Processing...
├─ LB24-001-ready.bam        ████████████████████ 100% (1.2 GB)
├─ LB24-001-ready.bam.bai    ████████████████████ 100% (4.5 MB)
└─ LB24-001-ready.vcf.gz     ████████████████████ 100% (125 MB)

Download complete: 3 files, 1.33 GB in 2m 15s
```

### URL Listing Mode

Generate download URLs without downloading files:

```bash
# List URLs to console
./varvis-download.js -t laborberlin -a 12345 --list-urls

# Save URLs to a file
./varvis-download.js -t laborberlin -a 12345 --list-urls --url-file download_urls.txt

# Pipe URLs to external download tools
./varvis-download.js -t laborberlin -a 12345 --list-urls | wget -i -
./varvis-download.js -t laborberlin -a 12345 --list-urls | aria2c -i -
```

**Use cases for URL listing**:

- **Debugging**: Verify correct URLs are generated before downloading
- **External tools**: Use wget, aria2c, or curl for downloading
- **Parallel downloads**: Split URLs across multiple download processes
- **Scripting**: Generate URLs for custom download workflows
- **Manual selection**: Review URLs before downloading specific files

**Example URL output**:

```
https://laborberlin.varvis.com/download/analysis/12345/LB24-001-ready.bam?token=abc123
https://laborberlin.varvis.com/download/analysis/12345/LB24-001-ready.bam.bai?token=abc123
https://laborberlin.varvis.com/download/analysis/12345/LB24-001-ready.vcf.gz?token=abc123
https://laborberlin.varvis.com/download/analysis/12345/LB24-001-ready.vcf.gz.tbi?token=abc123
```

**Integration with external tools**:

```bash
# Parallel download with wget
./varvis-download.js -t laborberlin -a 12345 --list-urls | wget -i - -P ./downloads/ --progress=bar

# Accelerated download with aria2c
./varvis-download.js -t laborberlin -a 12345 --list-urls | aria2c -i - -d ./downloads/ -j 8 -x 8

# Custom processing with curl
./varvis-download.js -t laborberlin -a 12345 --list-urls | while read url; do
  filename=$(basename "$url" | cut -d'?' -f1)
  curl -L "$url" -o "./downloads/$filename"
done
```

### Range Download Mode

Download specific genomic regions:

```bash
# Single genomic range
./varvis-download.js -t laborberlin -a 12345 -g "chr1:155183824-155194915"

# Multiple ranges
./varvis-download.js -t laborberlin -a 12345 -g "chr1:1000000-2000000 chr2:500000-1500000"

# BED file regions
./varvis-download.js -t laborberlin -a 12345 -b target_regions.bed
```

**BED file format**:

```
# target_regions.bed
chr1    155183824    155194915    BRCA1_region
chr2    25000000     26000000     DNMT3A_region
chr17   41196311     41277500     BRCA1_full
```

## Performance Optimization

### Concurrent Downloads

**Automatic parallelization**:

- Up to 5 concurrent downloads
- Intelligent queue management
- Bandwidth optimization

**Monitor concurrent downloads**:

```bash
# Watch active downloads
./varvis-download.js -t laborberlin -a "12345,67890,11111" --loglevel info

# Example output
[INFO] Starting download: sample_001.bam (1/6)
[INFO] Starting download: sample_002.bam (2/6)
[INFO] Starting download: sample_003.bam (3/6)
[INFO] Completed: sample_001.bam (1.2 GB in 45s)
[INFO] Starting download: sample_001.bam.bai (4/6)
```

### Resume Capability

**Automatic resume**:

- Interrupted downloads automatically resume
- Partial file validation
- Checksum verification

**Manual resume testing**:

```bash
# Start download
./varvis-download.js -t laborberlin -a 12345

# Interrupt with Ctrl+C, then restart
./varvis-download.js -t laborberlin -a 12345
# Resumes from where it left off
```

### Bandwidth Management

**Network optimization**:

- Adaptive chunk sizing
- Connection pooling
- Retry with exponential backoff

**Monitor network usage**:

```bash
# Real-time network monitoring during download
iftop -i eth0

# Bandwidth usage summary
./varvis-download.js -t laborberlin -a 12345 --loglevel info | grep "MB/s"
```

## Error Handling

### Common Download Errors

**Network timeouts**:

```
Error: Download timeout for sample_001.bam after 120 seconds
Retrying... (attempt 2/3)
```

**Disk space issues**:

```
Error: Insufficient disk space
Required: 2.1 GB, Available: 1.8 GB
```

**File corruption**:

```
Error: Checksum mismatch for sample_001.bam
Expected: abc123, Got: def456
Retrying download...
```

### Recovery Strategies

**Automatic retry logic**:

- Network errors: 3 retries with exponential backoff
- Server errors (5xx): 5 retries
- Rate limiting (429): Automatic delay and retry

**Manual recovery**:

```bash
# Force re-download specific file
rm sample_001.bam
./varvis-download.js -t laborberlin -a 12345 -f "bam"

# Verify file integrity
samtools view sample_001.bam | head
```

### Error Prevention

**Pre-download checks**:

```bash
# Check available disk space
df -h .

# Estimate download size
./varvis-download.js -t laborberlin -a 12345 --list | grep "Total size"

# Test network connectivity
./varvis-download.js -t laborberlin -a 12345 --list | head -1
```

## File Validation

### Automatic Validation

**Download verification**:

- File size validation
- Checksum verification (when available)
- Format validation for genomic files

**Post-download validation**:

```bash
# BAM file validation
samtools view -H sample_001.bam >/dev/null && echo "✓ Valid BAM"

# VCF file validation
tabix -l sample_001.vcf.gz >/dev/null && echo "✓ Valid VCF"

# Index file validation
samtools index sample_001.bam && echo "✓ Index created successfully"
```

### Manual Validation

**File integrity checks**:

```bash
# Check file sizes
ls -lh *.bam *.bai

# Verify BAM structure
samtools view sample_001.bam | head

# Check VCF header
zcat sample_001.vcf.gz | head -20

# Validate index files
samtools view sample_001.bam chr1:1-1000 | wc -l
```

## Advanced Download Features

### Filtering During Download

**Metadata filtering**:

```bash
# Filter by analysis type
./varvis-download.js -t laborberlin -s "LB24-001,LB24-002" -F "analysisType=SNV"

# Filter by sample properties
./varvis-download.js -t laborberlin -l "LIMS_123" -F "sampleId>LB24-0100"

# Multiple filters
./varvis-download.js -t laborberlin -a 12345 -F "analysisType=SNV" "quality>90"
```

### Conditional Downloads

**Size-based filtering**:

```bash
# Download only if file size is reasonable
./varvis-download.js -t laborberlin -a 12345 --list | grep -E "MB|GB" | grep -v "TB"
```

**Date-based filtering**:

```bash
# Download recent analyses only
./varvis-download.js -t laborberlin -s "LB24-$(date +%m%d)"
```

### Batch Download Patterns

**Daily download workflow**:

```bash
#!/bin/bash
# daily_download.sh

DATE=$(date +%Y%m%d)
DEST="./data/$DATE"
LOG="./logs/download_$DATE.log"

mkdir -p "$DEST" "./logs"

# Download today's samples
./varvis-download.js \
  -t laborberlin \
  -s "$(cat daily_samples.txt | tr '\n' ',')" \
  -d "$DEST" \
  --logfile "$LOG" \
  --reportfile "./reports/daily_$DATE.json"

echo "Download complete: $DEST"
echo "Log: $LOG"
```

**Multi-target download**:

```bash
#!/bin/bash
# multi_target_download.sh

TARGETS=("laborberlin" "uni-leipzig")
ANALYSIS_ID="12345"

for TARGET in "${TARGETS[@]}"; do
    echo "Downloading from $TARGET..."
    mkdir -p "./data/$TARGET"

    ./varvis-download.js \
      -t "$TARGET" \
      -a "$ANALYSIS_ID" \
      -d "./data/$TARGET" \
      --logfile "./logs/${TARGET}_download.log"
done
```

## Performance Monitoring

### Download Metrics

**Real-time monitoring**:

```bash
# Enable detailed metrics
./varvis-download.js -t laborberlin -a 12345 --loglevel info

# Monitor system resources
top -p $(pgrep -f varvis-download)
iostat -x 1
```

**Performance report**:

```bash
# Generate performance report
./varvis-download.js -t laborberlin -a 12345 --reportfile performance.json

# View metrics
cat performance.json | jq '.metrics'
```

**Example metrics output**:

```json
{
  "metrics": {
    "totalFiles": 4,
    "totalSize": "1.33 GB",
    "downloadTime": "2m 15s",
    "averageSpeed": "10.1 MB/s",
    "concurrentDownloads": 3,
    "retryCount": 1,
    "successRate": 100
  }
}
```

### Optimization Tips

**Network optimization**:

```bash
# Use local network when possible
./varvis-download.js -t laborberlin-local -a 12345

# Optimize for slow connections
export VARVIS_CHUNK_SIZE=32768  # 32KB chunks
```

**Storage optimization**:

```bash
# Download to fastest storage
./varvis-download.js -t laborberlin -a 12345 -d "/fast-ssd/genomics"

# Parallel storage for large datasets
./varvis-download.js -t laborberlin -a "12345,67890" -d "/parallel-fs/data"
```

## Integration Examples

### Workflow Integration

**Nextflow integration**:

```nextflow
process DOWNLOAD_GENOMIC_DATA {
    input:
    val analysis_id

    output:
    path "*.bam"
    path "*.bam.bai"

    script:
    """
    varvis-download -t laborberlin -a ${analysis_id} -f "bam,bam.bai"
    """
}
```

**Snakemake integration**:

```python
rule download_data:
    output:
        bam="data/{analysis_id}.bam",
        bai="data/{analysis_id}.bam.bai"
    shell:
        "varvis-download -t laborberlin -a {wildcards.analysis_id} -d data/"
```

### Quality Control Integration

**Automatic QC after download**:

```bash
#!/bin/bash
# download_and_qc.sh

ANALYSIS_ID="$1"
DATA_DIR="./data"

# Download files
./varvis-download.js -t laborberlin -a "$ANALYSIS_ID" -d "$DATA_DIR"

# Run QC
for BAM in "$DATA_DIR"/*.bam; do
    echo "Running QC on $BAM..."
    samtools flagstat "$BAM" > "${BAM%.bam}.flagstat"
    samtools depth "$BAM" | awk '{sum+=$3} END {print "Average depth:", sum/NR}' > "${BAM%.bam}.depth"
done

echo "Download and QC complete for analysis $ANALYSIS_ID"
```

## Next Steps

- **[Range Downloads](/guide/range-downloads)** - Genomic region extraction
- **[Archive Management](/guide/archive-management)** - Handling archived files
- **[Filtering & Search](/guide/filtering)** - Advanced file selection
