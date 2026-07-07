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
./varvis-download.cjs -t mytarget -a 12345
# Downloads: .bam and .bam.bai files
```

**Specific file types**:

```bash
# VCF workflow only
./varvis-download.cjs -t mytarget -a 12345 -f "vcf.gz,vcf.gz.tbi"

# All genomic data
./varvis-download.cjs -t mytarget -a 12345 -f "bam,bam.bai,vcf.gz,vcf.gz.tbi"

# Data files only (no indexes)
./varvis-download.cjs -t mytarget -a 12345 -f "bam,vcf.gz"
```

## Output Management

### Directory Structure

**Basic organization**:

```bash
# Download to current directory
./varvis-download.cjs -t mytarget -a 12345

# Download to specific directory
./varvis-download.cjs -t mytarget -a 12345 -d "./genomics-data"

# Organized by analysis
./varvis-download.cjs -t mytarget -a 12345 -d "./data/analysis_12345"
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
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000"
# Output: sample_001.chr1_1000000_2000000.bam

# Multiple ranges
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1-1000 chr2:1-1000"
# Output: sample_001.multiple-regions.bam

# BED file ranges
./varvis-download.cjs -t mytarget -a 12345 -b regions.bed
# Output: sample_001.multiple-regions.bam
```

### Overwrite Behavior

**Default behavior** (skip existing):

```bash
./varvis-download.cjs -t mytarget -a 12345
# Skips files that already exist
```

**Force overwrite**:

```bash
./varvis-download.cjs -t mytarget -a 12345 --overwrite
# Overwrites existing files
```

**Skip behavior**:

By default a file that already exists at the destination is skipped (counted
under "Files Skipped" in the summary). Skipping is based purely on the file's
presence at the destination path — the tool does not compare sizes, timestamps,
or checksums. Pass `--overwrite` to re-download and replace it.

## Download Modes

### Preview Mode

List available files without downloading:

```bash
./varvis-download.cjs -t mytarget -a 12345 --list
```

**Example output**:

```
Analysis ID: 12345
Sample: LIMS-001
Available files:
  ✓ LIMS-001-ready.bam (1.2 GB)
  ✓ LIMS-001-ready.bam.bai (4.5 MB)
  ✓ LIMS-001-ready.vcf.gz (125 MB)
  ✓ LIMS-001-ready.vcf.gz.tbi (2.1 MB)
  ⚠ LIMS-001-backup.bam (archived)

Total size: 1.33 GB
Available immediately: 1.33 GB
Requires restoration: 2.1 GB
```

### Full Download Mode

Download complete files:

```bash
# Single analysis
./varvis-download.cjs -t mytarget -a 12345

# Multiple analyses
./varvis-download.cjs -t mytarget -a "12345,67890,11111"

# Progress output
./varvis-download.cjs -t mytarget -a 12345
```

**Progress display** — files download one at a time, each with its own progress bar:

```
  downloading [=========           ] 5033164/bps 45% 4.2s
```

### URL Listing Mode

Generate download URLs without downloading files:

```bash
# List URLs to console
./varvis-download.cjs -t mytarget -a 12345 --list-urls

# Save URLs to a file
./varvis-download.cjs -t mytarget -a 12345 --list-urls --url-file download_urls.txt

# Pipe URLs to external download tools
./varvis-download.cjs -t mytarget -a 12345 --list-urls | wget -i -
./varvis-download.cjs -t mytarget -a 12345 --list-urls | aria2c -i -
```

**Use cases for URL listing**:

- **Debugging**: Verify correct URLs are generated before downloading
- **External tools**: Use wget, aria2c, or curl for downloading
- **Parallel downloads**: Split URLs across multiple download processes
- **Scripting**: Generate URLs for custom download workflows
- **Manual selection**: Review URLs before downloading specific files

**Example URL output**:

```
https://mytarget.varvis.com/download/analysis/12345/LIMS-001-ready.bam?token=abc123
https://mytarget.varvis.com/download/analysis/12345/LIMS-001-ready.bam.bai?token=abc123
https://mytarget.varvis.com/download/analysis/12345/LIMS-001-ready.vcf.gz?token=abc123
https://mytarget.varvis.com/download/analysis/12345/LIMS-001-ready.vcf.gz.tbi?token=abc123
```

**Integration with external tools**:

```bash
# Parallel download with wget
./varvis-download.cjs -t mytarget -a 12345 --list-urls | wget -i - -P ./downloads/ --progress=bar

# Accelerated download with aria2c
./varvis-download.cjs -t mytarget -a 12345 --list-urls | aria2c -i - -d ./downloads/ -j 8 -x 8

# Custom processing with curl
./varvis-download.cjs -t mytarget -a 12345 --list-urls | while read url; do
  filename=$(basename "$url" | cut -d'?' -f1)
  curl -L "$url" -o "./downloads/$filename"
done
```

### Range Download Mode

Download specific genomic regions:

```bash
# Single genomic range
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000"

# Multiple ranges
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000 chr2:500000-1500000"

# BED file regions
./varvis-download.cjs -t mytarget -a 12345 -b target_regions.bed
```

**BED file format**:

```
# target_regions.bed
chr1    1000000      2000000      region_a
chr2    500000       1500000      region_b
chr7    5500000      5600000      region_c
```

**VCF Range Downloads**:

VCF ranged downloads use a robust `tabix -h | bgzip` pipeline that automatically downloads the required index files and executes tabix in the correct directory:

```bash
# Single region creates: sample.chr1_1000000_2000000.vcf.gz
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000" -f "vcf.gz,vcf.gz.tbi"

# Multiple regions create separate files for each region
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000 chr2:500000-1500000" -f "vcf.gz,vcf.gz.tbi"
# Output: sample.chr1_1000000_2000000.vcf.gz, sample.chr2_500000_1500000.vcf.gz
```

**VCF Pipeline Process**:

1. **Index Download**: Downloads the `.tbi` index file first
2. **Directory Execution**: Executes `tabix` in the directory containing the index file
3. **URL Quoting**: Properly quotes the VCF URL to handle query parameters
4. **Header Inclusion**: Uses `tabix -h` to include VCF headers in the output
5. **Compression**: Pipes through `bgzip -c` for proper VCF.gz format
6. **Re-indexing**: Creates new `.tbi` index for the ranged file

**Requirements for VCF Range Downloads**:

- `tabix` v1.20+ (for remote URL support with -h flag)
- `bgzip` v1.20+ (for compression pipeline)
- Both VCF file and index file must be available

## Performance & Parallelism

### Downloads are sequential

Within a single run, files are downloaded one at a time — the tool does not
parallelize downloads itself. To download in parallel, run several invocations
against different analyses, or use `--list-urls` and pipe the URLs to a parallel
downloader:

```bash
# Fan URLs out to aria2c (parallel segments)
./varvis-download.cjs -t mytarget -a 12345 --list-urls | aria2c -i -

# Or to GNU parallel + wget
./varvis-download.cjs -t mytarget -a 12345 --list-urls | parallel -j4 wget
```

### Re-running an interrupted download

There is **no** byte-range resume of a partially downloaded file: if a download
is interrupted, the incomplete file is removed. Re-running the same command
downloads it again, skipping any files that already completed (unless
`--overwrite` is set).

Archived files awaiting restoration are a separate case — they can be resumed
once their restoration window passes; see
[Archive Management](/guide/archive-management) and `--resumeArchivedDownloads`.

### Network behavior

- Persistent (keep-alive) connections via a pooled undici HTTP agent
- Automatic retry with exponential backoff on transient failures (network
  errors, HTTP 5xx, and 429); permanent 4xx responses fail fast

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

**Interrupted or failed download**:

```
Error: Download response for … did not include a body
```

The partial output file is removed and the error is reported; re-run the command to try again.

### Recovery Strategies

**Automatic retry logic**:

- Network errors: 3 retries with exponential backoff
- Server errors (5xx): 5 retries
- Rate limiting (429): Automatic delay and retry

**Manual recovery**:

```bash
# Force re-download specific file
rm sample_001.bam
./varvis-download.cjs -t mytarget -a 12345 -f "bam"

# Verify file integrity
samtools view sample_001.bam | head
```

### Error Prevention

**Pre-download checks**:

```bash
# Check available disk space
df -h .

# Estimate download size
./varvis-download.cjs -t mytarget -a 12345 --list | grep "Total size"

# Test network connectivity
./varvis-download.cjs -t mytarget -a 12345 --list | head -1
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
./varvis-download.cjs -t mytarget -s "LIMS-001,LIMS-002" -F "analysisType=SNV"

# Filter by sample properties
./varvis-download.cjs -t mytarget -l "LIMS_123" -F "sampleId>LIMS-100"

# Multiple filters
./varvis-download.cjs -t mytarget -a 12345 -F "analysisType=SNV" "quality>90"
```

### Conditional Downloads

**Size-based filtering**:

```bash
# Download only if file size is reasonable
./varvis-download.cjs -t mytarget -a 12345 --list | grep -E "MB|GB" | grep -v "TB"
```

**Date-based filtering**:

```bash
# Download recent analyses only
./varvis-download.cjs -t mytarget -s "LIMS-$(date +%m%d)"
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
./varvis-download.cjs \
  -t mytarget \
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

TARGETS=("mytarget" "othertarget")
ANALYSIS_ID="12345"

for TARGET in "${TARGETS[@]}"; do
    echo "Downloading from $TARGET..."
    mkdir -p "./data/$TARGET"

    ./varvis-download.cjs \
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
./varvis-download.cjs -t mytarget -a 12345 --loglevel info

# Monitor system resources
top -p $(pgrep -f varvis-download)
iostat -x 1
```

**Summary report**:

`--reportfile` writes the end-of-run summary (also printed to the log) as
**plain text** — not JSON:

```bash
./varvis-download.cjs -t mytarget -a 12345 --reportfile download-report.txt
cat download-report.txt
```

```
    Download Summary Report:
    ------------------------
    Total Files Processed: 4
    Files Downloaded: 3
    Files Skipped (already exist): 1
    Total Bytes Downloaded: 1428160512
    Average Download Speed: 10592342.55 bytes/sec
    Total Time Taken: 135.20 seconds
```

### Optimization Tips

**Network optimization**:

```bash
# Prefer a nearby/faster target instance when one is available
./varvis-download.cjs -t mytarget-local -a 12345
```

**Storage optimization**:

```bash
# Download to fastest storage
./varvis-download.cjs -t mytarget -a 12345 -d "/fast-ssd/genomics"

# Parallel storage for large datasets
./varvis-download.cjs -t mytarget -a "12345,67890" -d "/parallel-fs/data"
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
    varvis-download -t mytarget -a ${analysis_id} -f "bam,bam.bai"
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
        "varvis-download -t mytarget -a {wildcards.analysis_id} -d data/"
```

### Quality Control Integration

**Automatic QC after download**:

```bash
#!/bin/bash
# download_and_qc.sh

ANALYSIS_ID="$1"
DATA_DIR="./data"

# Download files
./varvis-download.cjs -t mytarget -a "$ANALYSIS_ID" -d "$DATA_DIR"

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
