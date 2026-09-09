# Range Downloads

Extract specific genomic regions from BAM and VCF files using coordinates or BED files with automatic tool integration.

## Overview

Range downloads allow you to extract specific genomic regions instead of downloading entire files, providing:

- **Focused data retrieval** - Select regions of interest
- **Reduced data transfer** - Download only what you need
- **Storage efficiency** - Smaller files for specific analyses
- **Faster processing** - Work with relevant data quickly

## Prerequisites

Range downloads require external bioinformatics tools:

| Tool         | Version | Purpose                                   |
| ------------ | ------- | ----------------------------------------- |
| **samtools** | v1.17+  | BAM file processing and region extraction |
| **tabix**    | v1.20+  | VCF file indexing and querying            |
| **bgzip**    | v1.20+  | VCF file compression                      |

### Tool Installation

**Ubuntu/Debian:**

```bash
sudo apt update
sudo apt install samtools tabix
```

**macOS (Homebrew):**

```bash
brew install samtools htslib
```

**Conda/Mamba:**

```bash
conda install -c bioconda samtools tabix
```

### Verification

Check tool availability and versions:

```bash
samtools --version | head -1
tabix --version 2>&1 | head -1
bgzip --version 2>&1 | head -1
```

The tool automatically verifies these dependencies when using range features.

## Basic Range Syntax

### Genomic Coordinates

Use standard genomic coordinate format: `chromosome:start-end`

```bash
# Single genomic region
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000"

# Multiple regions (space-separated)
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000 chr2:500000-1500000"

# Another region
./varvis-download.cjs -t mytarget -a 12345 -g "chr7:5500000-5600000"
```

### BED File Regions

Use BED files for complex region definitions:

**Create regions.bed:**

```bed
chr1    1000000      2000000      region_a
chr2    500000       1500000      region_b
chr7    5500000      5600000      region_c
chrX    1000000      1100000      region_x
```

**Use BED file:**

```bash
./varvis-download.cjs -t mytarget -a 12345 -b regions.bed
```

## File Type Behavior

### BAM Files

**Range extraction for BAM:**

- Uses `samtools view` with region specification
- Requires BAM index (.bai) file
- Automatically downloads index if not present
- Creates new index for extracted BAM

```bash
# BAM range download
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000" -f "bam,bam.bai"
```

**Output files:**

```
sample_001.chr1_1000000_2000000.bam      # Extracted region
sample_001.chr1_1000000_2000000.bam.bai  # New index
```

### VCF Files

**Range extraction for VCF:**

- Uses `tabix` for region querying
- Requires VCF index (.tbi) file
- Automatically compresses output with `bgzip`
- Creates new index for extracted VCF

```bash
# VCF range download
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000" -f "vcf.gz,vcf.gz.tbi"
```

**Output files:**

```
sample_001.chr1_1000000_2000000.vcf.gz     # Extracted and compressed
sample_001.chr1_1000000_2000000.vcf.gz.tbi # New index
```

## Advanced Range Examples

### Region-Specific Downloads

**Multiple defined regions:**

```bash
# Region A
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000"

# Region B
./varvis-download.cjs -t mytarget -a 12345 -g "chr2:500000-1500000"

# Both regions
./varvis-download.cjs -t mytarget -a 12345 \
  -g "chr1:1000000-2000000 chr2:500000-1500000"
```

**Research region set:**

```bash
# Create research_regions.bed
cat > research_regions.bed << EOF
chr1    1000000     2000000     region_a
chr2    500000      1500000     region_b
chr7    5500000     5600000     region_c
chr12   25000000    25100000    region_d
chr20   1000000     1100000     region_e
EOF

# Download research regions
./varvis-download.cjs -t mytarget -a 12345 -b research_regions.bed
```

## Unmapped Read Extraction

The `--unmapped` flag extracts reads with no reference assignment from BAM files using the samtools wildcard chromosome `*`. This is useful for identifying contamination, adapter sequences, or novel sequences (e.g., in Illumina NovaSeq data).

### Unmapped Only

```bash
# Extract only unmapped reads (creates sample.unmapped.bam)
./varvis-download.cjs -t mytarget -a 12345 --unmapped
```

Only samtools is required (no tabix/bgzip). VCF files are automatically skipped.

### Combined with Range Downloads

When used with `--range`, both ranged and unmapped reads are included in a **single BAM file**:

```bash
# Single BAM with a genomic region + unmapped reads
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000" --unmapped
```

This uses command-line regions instead of a BED file to allow the `*` wildcard alongside genomic coordinates.

### Exome Regions

**Target-enriched data retrieval:**

```bash
# Download exome target regions
./varvis-download.cjs -t mytarget -a 12345 -b exome_targets.bed -f "bam,bam.bai"
```

**Custom region panel:**

```bash
# Create custom region BED file
cat > custom_regions.bed << EOF
chr1    1000000     2000000     region_a
chr2    500000      1500000     region_b
chr3    2500000     2600000     region_c
chr7    5500000     5600000     region_d
chr11   1000000     1100000     region_e
EOF

./varvis-download.cjs -t mytarget -a 12345 -b custom_regions.bed
```

### Whole Chromosome Downloads

**Single chromosome:**

```bash
# Chromosome 21 (smallest autosome)
./varvis-download.cjs -t mytarget -a 12345 -g "chr21:1-48129895"

# X chromosome
./varvis-download.cjs -t mytarget -a 12345 -g "chrX:1-156040895"
```

**Multiple chromosomes:**

```bash
# Chromosomes 21 and 22
./varvis-download.cjs -t mytarget -a 12345 \
  -g "chr21:1-48129895 chr22:1-50818468"
```

## Range Download Workflow

### Complete Workflow Example

```bash
#!/bin/bash
# range_download_workflow.sh

ANALYSIS_ID="12345"
REGION_LABEL="region_a"
REGION="chr1:1000000-2000000"
OUTPUT_DIR="./range_${ANALYSIS_ID}_${REGION_LABEL}"

echo "Starting range download workflow for $REGION_LABEL..."

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Download BAM region
echo "Downloading BAM region: $REGION"
./varvis-download.cjs -t mytarget -a "$ANALYSIS_ID" \
  -g "$REGION" \
  -f "bam,bam.bai" \
  -d "$OUTPUT_DIR"

# Download VCF region
echo "Downloading VCF region: $REGION"
./varvis-download.cjs -t mytarget -a "$ANALYSIS_ID" \
  -g "$REGION" \
  -f "vcf.gz,vcf.gz.tbi" \
  -d "$OUTPUT_DIR"

# Verify downloads
echo "Verifying downloaded files..."
for FILE in "$OUTPUT_DIR"/*.bam; do
    if samtools view -H "$FILE" >/dev/null 2>&1; then
        echo "✓ Valid BAM: $(basename "$FILE")"
    else
        echo "✗ Invalid BAM: $(basename "$FILE")"
    fi
done

for FILE in "$OUTPUT_DIR"/*.vcf.gz; do
    if tabix -l "$FILE" >/dev/null 2>&1; then
        echo "✓ Valid VCF: $(basename "$FILE")"
    else
        echo "✗ Invalid VCF: $(basename "$FILE")"
    fi
done

echo "Range download workflow complete: $OUTPUT_DIR"
```

### Quality Control Integration

**Post-download QC:**

```bash
#!/bin/bash
# range_qc.sh

REGION_BAM="sample_001.chr1_1000000_2000000.bam"
REGION_VCF="sample_001.chr1_1000000_2000000.vcf.gz"

# BAM QC
echo "BAM Quality Control:"
samtools flagstat "$REGION_BAM"
samtools view "$REGION_BAM" | wc -l | xargs echo "Total reads:"

# VCF QC
echo "VCF Quality Control:"
zcat "$REGION_VCF" | grep -v "^#" | wc -l | xargs echo "Total variants:"
zcat "$REGION_VCF" | grep -v "^#" | cut -f7 | sort | uniq -c | sort -nr
```

## Performance Considerations

### File Size Impact

**Typical size reductions:**

- **Single small region**: 99% size reduction
- **Exome regions**: 98% size reduction
- **Chromosome**: 96% size reduction
- **Multiple regions**: 95-99% reduction

**Size estimation:**

```bash
# Check original file sizes
./varvis-download.cjs -t mytarget -a 12345 --list | grep -E "bam|vcf"

# Estimate region size (rough calculation)
# Region size / Genome size * Original file size
# Example: 10kb region / 3.2Gb genome * 2GB file = ~6KB
```

### Network Optimization

**Range downloads are faster because:**

- Smaller data transfer
- Less network time
- Reduced bandwidth usage
- Parallel processing possible

**Optimize for multiple regions:**

```bash
# Download regions in parallel (separate processes)
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000" &
./varvis-download.cjs -t mytarget -a 12345 -g "chr2:500000-1500000" &
./varvis-download.cjs -t mytarget -a 12345 -g "chr7:5500000-5600000" &
wait  # Wait for all downloads to complete
```

### Storage Optimization

**Efficient storage patterns:**

```bash
# Organize by region
mkdir -p ./regions/{region_a,region_b,region_c}

# Download to specific directories
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000" -d "./regions/region_a/"
./varvis-download.cjs -t mytarget -a 12345 -g "chr2:500000-1500000" -d "./regions/region_b/"
./varvis-download.cjs -t mytarget -a 12345 -g "chr7:5500000-5600000" -d "./regions/region_c/"
```

## Bounded-Range Reverse Proxy (S3 Egress Guard)

### The Cloud Egress Problem in HTSlib

When reading remote indexed genomic files (BAM and VCF) via HTTP or S3 pre-signed URLs, HTSlib (< 1.25.0, the core library powering `samtools` and `tabix`) issues open-ended HTTP range requests:

```http
GET /sample.bam HTTP/1.1
Range: bytes=0-
```

or for specific genomic coordinates:

```http
GET /sample.bam HTTP/1.1
Range: bytes=8224425-
```

While `samtools` only reads a small initial portion (such as 64 KiB for the BAM header or ~130 KiB for a targeted alignment chunk) before closing the downstream client socket, AWS S3 does not immediately stop sending data. Because S3 streams the full object payload across TCP socket buffers and WAN hops until connection teardown propagates, tens of gigabytes of unintended data egress can be transferred and billed per request (see [LaborBerlin/varvis-download#22](https://github.com/LaborBerlin/varvis-download/issues/22)). For an exome BAM file (~17.28 GB), two small sliced queries can easily incur over 34 GB of cloud egress charges.

### In-Process Reverse Proxy Architecture

To eliminate this vulnerability without requiring upstream server modifications or waiting for widespread HTSlib upgrades, `varvis-download` features an automated in-process reverse proxy:

1. **Ephemeral Local Loopback**: When a ranged download begins, `varvis-download` boots an in-process HTTP proxy on `127.0.0.1` using an ephemeral port.
2. **Cryptographic Token Route Protection**: Each proxy instance generates a random UUID token (`/stream/<uuid>`) ensuring that only the spawned `samtools` or `tabix` child process can access the proxy endpoint.
3. **Range Bounding & Clamping**: Every incoming HTTP Range header is evaluated:
   - Unbounded queries (`bytes=start-`) are rewritten to bounded requests: `bytes=start-(start + chunkSize - 1)`.
   - Oversized bounded ranges are clamped to the configured maximum chunk boundary.
4. **Immediate Upstream Abort**: When `samtools` or `tabix` closes the downstream TCP socket, the proxy's `AbortController` instantly aborts the active upstream fetch to S3. Upstream transfer stops within milliseconds, preventing TCP stream drain.
5. **Deterministic Cleanup**: Proxy instances are strictly bounded to the lifecycle of the download command and guaranteed to close in `finally` handlers on success and failure alike.

### Configuration & CLI Options

The reverse proxy is enabled by default for all ranged downloads.

#### CLI Flags

```bash
# Explicitly enable proxy (default)
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000" --bounded-range-proxy

# Disable proxy (direct upstream connection)
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000" --no-bounded-range-proxy

# Customize chunk size (e.g., 4 MiB)
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000" --bounded-range-chunk-size 4194304
```

| Flag                         | Type    | Default           | Description                                                                                       |
| ---------------------------- | ------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| `--bounded-range-proxy`      | boolean | `true`            | Enables in-process proxy for ranged BAM/VCF downloads. Use `--no-bounded-range-proxy` to disable. |
| `--bounded-range-chunk-size` | number  | `2097152` (2 MiB) | Maximum bytes requested per upstream HTTP Range chunk.                                            |

#### Configuration File Syntax

Options can also be configured permanently in `.config.json`:

```json
{
  "target": "mytarget",
  "boundedRangeProxy": true,
  "boundedRangeChunkSize": 2097152
}
```

### Automatic Tool Version Guard

Modern versions of HTSlib (>= 1.25.0) incorporate native support for bounded range requests. `varvis-download` automatically inspects the installed version of `samtools` and `tabix` before dispatching downloads:

- **Installed tool < 1.25.0**: The bounded-range proxy is kept active to protect against cloud egress leaks.
- **Installed tool >= 1.25.0**: The proxy is automatically bypassed, connecting the tool directly to the upstream URL with zero overhead.
- **Explicit Override**: Passing `--bounded-range-proxy` explicitly on the command line forces the proxy to remain enabled regardless of tool version.

::: tip Tool & HTSlib Version Compatibility
The proxy operates purely at the HTTP protocol layer on loopback (`http://127.0.0.1:<port>/stream/<token>`). Because it intercepts downstream HTTP Range headers and streams chunked responses, it is compatible with any tool release issuing unbounded ranges, including mixed binary builds (e.g., `samtools 1.20` dynamically linked against `HTSlib 1.23`). Development and CI tests baseline on standard lockstep releases (`1.20/1.20`, `1.21/1.21`), as exhaustive permutation testing across all decoupled samtools and HTSlib version pairs is not maintained.
:::

### Egress Savings Benchmark

To verify and benchmark the real-world egress reduction against the public 1000 Genomes S3 exome BAM (17.28 GB, 17,282,007,379 bytes), run the included benchmark script:

```bash
node scripts/benchmark-bounded-proxy.mjs
```

Benchmark results comparing two simulated ranged queries (64 KiB BAM header + 130 KiB region slice):

| Metric                        | Without Proxy (Unbounded HTSlib)           | With Bounded Proxy     | Reduction    |
| ----------------------------- | ------------------------------------------ | ---------------------- | ------------ |
| **HTTP Range Requests**       | 2 unbounded (`bytes=0-`, `bytes=8224425-`) | 2 bounded (2 MiB max)  | -            |
| **Client Data Read**          | ~246 KiB                                   | ~247 KiB               | Equal        |
| **Max Upstream S3 Egress**    | 34.56 GB (34,555,790,333 B)                | 4.00 MiB (4,194,304 B) | **> 99.98%** |
| **Actual Expected S3 Egress** | 17.2 – 34.5 GB (stream drain)              | ~4.00 MiB              | **> 99.9%**  |

### How to Verify in Production

To verify that the proxy is actively intercepting and protecting your downloads in production:

1. **Enable Debug Logging**:
   ```bash
   ./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000" --loglevel debug
   ```
2. **Observe Proxy Lifecycle in Logs**:
   - `Proxying ranged BAM download through bounded-range reverse proxy`
   - Child process execution passes a loopback target: `samtools view ... http://127.0.0.1:<port>/stream/<token>`
   - Bounded range rewrites: `Upstream Range: bytes=0-2097151`
   - Clean shutdown upon completion.

## Integration with Downstream Research Tools

### Optional Downstream Processing

**Region-specific processing:**

```bash
# Download region
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000" -f "bam,bam.bai"

# Run a downstream research workflow on the region
REGION_BAM="sample_001.chr1_1000000_2000000.bam"
REFERENCE="/data/reference/hg38.fa"
OUTPUT_VCF="research_output.chr1_1000000_2000000.vcf"

# Example with a user-managed external tool
gatk HaplotypeCaller \
  -R "$REFERENCE" \
  -I "$REGION_BAM" \
  -O "$OUTPUT_VCF" \
  -L "chr1:1000000-2000000"
```

### Coverage Analysis

**Regional coverage analysis:**

```bash
# Download BAM region
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000" -f "bam,bam.bai"

# Calculate coverage for region
REGION_BAM="sample_001.chr1_1000000_2000000.bam"

# Per-base coverage
samtools depth "$REGION_BAM" > coverage.chr1_1000000_2000000.txt

# Coverage statistics
samtools depth "$REGION_BAM" | awk '{sum+=$3; count++} END {print "Average coverage:", sum/count}'

# Coverage histogram
samtools depth "$REGION_BAM" | cut -f3 | sort -n | uniq -c | sort -nr > coverage_histogram.txt
```

### Research Annotation Workflows

**Region-specific research annotation:**

```bash
# Download VCF region
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000" -f "vcf.gz,vcf.gz.tbi"

# Annotate variants in region
REGION_VCF="sample_001.chr1_1000000_2000000.vcf.gz"

# VEP annotation
vep --input_file "$REGION_VCF" \
    --output_file "annotated.chr1_1000000_2000000.vcf" \
    --format vcf \
    --vcf \
    --symbol \
    --terms SO \
    --tsl \
    --hgvs \
    --fasta /data/reference/hg38.fa \
    --offline \
    --cache
```

## Troubleshooting Range Downloads

### Common Issues

**Tool not found errors:**

```
Error: samtools not found or version too old
Required: samtools v1.17+, Found: v1.10
```

**Solution:**

```bash
# Update samtools
conda install -c bioconda samtools=1.17
# or
sudo apt install samtools=1.17
```

**Index file issues:**

```
Error: Could not load index for sample_001.bam
```

**Solution:**

```bash
# The tool should automatically download indexes
# If manual intervention needed:
samtools index sample_001.bam
```

**Region format errors:**

```
Error: Invalid region format: chr1:1000000_2000000
```

**Solution:**

```bash
# Use colon and dash: chr1:1000000-2000000
# Not underscore: chr1:1000000_2000000
```

### Debug Range Downloads

**Enable debug logging:**

```bash
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000" --loglevel debug
```

**Test region validity:**

```bash
# Test with a small region first
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000-2000" --list

# Verify chromosome naming
./varvis-download.cjs -t mytarget -a 12345 --list | grep -i bam
samtools view -H original.bam | grep "@SQ"  # Check chromosome names
```

**Manual tool testing:**

```bash
# Test samtools with region
samtools view original.bam "chr1:1000000-2000000" | head

# Test tabix with region
tabix original.vcf.gz "chr1:1000000-2000000" | head
```

## Best Practices

### Region Selection

1. **Use specific regions for focused retrieval**
2. **Combine related regions in single downloads**
3. **Document the coordinate source and reference genome build**
4. **Use standard coordinate systems (0-based or 1-based consistently)**

### File Management

1. **Organize by region and analysis identifier**
2. **Use descriptive directory names**
3. **Keep original and extracted files separate**
4. **Document region coordinates and purposes**

### Quality Control

1. **Always verify extracted files**
2. **Check read/variant counts in regions**
3. **Validate chromosome naming consistency**
4. **Test with small regions before large downloads**

## Next Steps

- **[Archive Management](/guide/archive-management)** - Handle archived files
- **[Batch Operations](/guide/batch-operations)** - Large-scale processing
- **[Examples](/examples/)** - Real-world download scenarios
