# Range Downloads

Extract specific genomic regions from BAM and VCF files using coordinates or BED files with automatic tool integration.

## Overview

Range downloads allow you to extract specific genomic regions instead of downloading entire files, providing:

- **Targeted analysis** - Focus on regions of interest
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
./varvis-download.js -t laborberlin -a 12345 -g "chr1:1000000-2000000"

# Multiple regions (space-separated)
./varvis-download.js -t laborberlin -a 12345 -g "chr1:1000000-2000000 chr2:500000-1500000"

# Specific gene regions
./varvis-download.js -t laborberlin -a 12345 -g "chr17:41196311-41277500"  # BRCA1
```

### BED File Regions

Use BED files for complex region definitions:

**Create regions.bed:**

```bed
chr1    155183824    155194915    BRCA1_region
chr2    25000000     26000000     DNMT3A_region
chr17   41196311     41277500     BRCA1_full
chrX    153280000    153290000    G6PD_region
```

**Use BED file:**

```bash
./varvis-download.js -t laborberlin -a 12345 -b regions.bed
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
./varvis-download.js -t laborberlin -a 12345 -g "chr1:1000000-2000000" -f "bam,bam.bai"
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
./varvis-download.js -t laborberlin -a 12345 -g "chr1:1000000-2000000" -f "vcf.gz,vcf.gz.tbi"
```

**Output files:**

```
sample_001.chr1_1000000_2000000.vcf.gz     # Extracted and compressed
sample_001.chr1_1000000_2000000.vcf.gz.tbi # New index
```

## Advanced Range Examples

### Gene-Specific Downloads

**BRCA1/BRCA2 analysis:**

```bash
# BRCA1 region (chr17:41,196,311-41,277,500)
./varvis-download.js -t laborberlin -a 12345 -g "chr17:41196311-41277500"

# BRCA2 region (chr13:32,890,598-32,973,805)
./varvis-download.js -t laborberlin -a 12345 -g "chr13:32890598-32973805"

# Both genes
./varvis-download.js -t laborberlin -a 12345 \
  -g "chr17:41196311-41277500 chr13:32890598-32973805"
```

**Cancer gene panel:**

```bash
# Create cancer_genes.bed
cat > cancer_genes.bed << EOF
chr17   41196311    41277500    BRCA1
chr13   32890598    32973805    BRCA2
chr3    179198000   179199000   PIK3CA
chr10   87957915    87965546    PTEN
chr17   7571719     7590868     TP53
EOF

# Download cancer gene regions
./varvis-download.js -t laborberlin -a 12345 -b cancer_genes.bed
```

### Exome Regions

**Targeted exome analysis:**

```bash
# Download exome target regions
./varvis-download.js -t laborberlin -a 12345 -b exome_targets.bed -f "bam,bam.bai"
```

**Custom panel regions:**

```bash
# Create custom panel BED file
cat > cardio_panel.bed << EOF
chr1    155200000   155210000   CACNA1C
chr2    166200000   166300000   SCN2A
chr3    38600000    38700000    SCN5A
chr7    35900000    36000000    KCNH2
chr11   17400000    17500000    KCNQ1
EOF

./varvis-download.js -t laborberlin -a 12345 -b cardio_panel.bed
```

### Whole Chromosome Downloads

**Single chromosome:**

```bash
# Chromosome 21 (smallest autosome)
./varvis-download.js -t laborberlin -a 12345 -g "chr21:1-48129895"

# X chromosome
./varvis-download.js -t laborberlin -a 12345 -g "chrX:1-156040895"
```

**Multiple chromosomes:**

```bash
# Chromosomes 21 and 22
./varvis-download.js -t laborberlin -a 12345 \
  -g "chr21:1-48129895 chr22:1-50818468"
```

## Range Download Workflow

### Complete Workflow Example

```bash
#!/bin/bash
# range_download_workflow.sh

ANALYSIS_ID="12345"
TARGET_GENE="BRCA1"
REGION="chr17:41196311-41277500"
OUTPUT_DIR="./analysis_${ANALYSIS_ID}_${TARGET_GENE}"

echo "Starting range download workflow for $TARGET_GENE..."

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Download BAM region
echo "Downloading BAM region: $REGION"
./varvis-download.js -t laborberlin -a "$ANALYSIS_ID" \
  -g "$REGION" \
  -f "bam,bam.bai" \
  -d "$OUTPUT_DIR"

# Download VCF region
echo "Downloading VCF region: $REGION"
./varvis-download.js -t laborberlin -a "$ANALYSIS_ID" \
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

REGION_BAM="sample_001.chr17_41196311_41277500.bam"
REGION_VCF="sample_001.chr17_41196311_41277500.vcf.gz"

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

- **Single gene region**: 99% size reduction
- **Exome regions**: 98% size reduction
- **Chromosome**: 96% size reduction
- **Multiple genes**: 95-99% reduction

**Size estimation:**

```bash
# Check original file sizes
./varvis-download.js -t laborberlin -a 12345 --list | grep -E "bam|vcf"

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
./varvis-download.js -t laborberlin -a 12345 -g "chr1:1000000-2000000" &
./varvis-download.js -t laborberlin -a 12345 -g "chr2:500000-1500000" &
./varvis-download.js -t laborberlin -a 12345 -g "chr17:41196311-41277500" &
wait  # Wait for all downloads to complete
```

### Storage Optimization

**Efficient storage patterns:**

```bash
# Organize by gene/region
mkdir -p ./regions/{BRCA1,BRCA2,TP53}

# Download to specific directories
./varvis-download.js -t laborberlin -a 12345 -g "chr17:41196311-41277500" -d "./regions/BRCA1/"
./varvis-download.js -t laborberlin -a 12345 -g "chr13:32890598-32973805" -d "./regions/BRCA2/"
./varvis-download.js -t laborberlin -a 12345 -g "chr17:7571719-7590868" -d "./regions/TP53/"
```

## Integration with Analysis Tools

### Variant Calling

**Region-specific variant calling:**

```bash
# Download region
./varvis-download.js -t laborberlin -a 12345 -g "chr17:41196311-41277500" -f "bam,bam.bai"

# Run variant calling on region
REGION_BAM="sample_001.chr17_41196311_41277500.bam"
REFERENCE="/data/reference/hg38.fa"
OUTPUT_VCF="variants.chr17_41196311_41277500.vcf"

# Call variants with your preferred tool
gatk HaplotypeCaller \
  -R "$REFERENCE" \
  -I "$REGION_BAM" \
  -O "$OUTPUT_VCF" \
  -L "chr17:41196311-41277500"
```

### Coverage Analysis

**Regional coverage analysis:**

```bash
# Download BAM region
./varvis-download.js -t laborberlin -a 12345 -g "chr17:41196311-41277500" -f "bam,bam.bai"

# Calculate coverage for region
REGION_BAM="sample_001.chr17_41196311_41277500.bam"

# Per-base coverage
samtools depth "$REGION_BAM" > coverage.chr17_41196311_41277500.txt

# Coverage statistics
samtools depth "$REGION_BAM" | awk '{sum+=$3; count++} END {print "Average coverage:", sum/count}'

# Coverage histogram
samtools depth "$REGION_BAM" | cut -f3 | sort -n | uniq -c | sort -nr > coverage_histogram.txt
```

### Annotation Workflows

**Region-specific annotation:**

```bash
# Download VCF region
./varvis-download.js -t laborberlin -a 12345 -g "chr17:41196311-41277500" -f "vcf.gz,vcf.gz.tbi"

# Annotate variants in region
REGION_VCF="sample_001.chr17_41196311_41277500.vcf.gz"

# VEP annotation
vep --input_file "$REGION_VCF" \
    --output_file "annotated.chr17_41196311_41277500.vcf" \
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
./varvis-download.js -t laborberlin -a 12345 -g "chr1:1000000-2000000" --loglevel debug
```

**Test region validity:**

```bash
# Test with a small region first
./varvis-download.js -t laborberlin -a 12345 -g "chr1:1000-2000" --list

# Verify chromosome naming
./varvis-download.js -t laborberlin -a 12345 --list | grep -i bam
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

1. **Use specific regions for targeted analysis**
2. **Combine related genes in single downloads**
3. **Consider regulatory regions around genes**
4. **Use standard coordinate systems (0-based or 1-based consistently)**

### File Management

1. **Organize by gene/region/analysis**
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
- **[Examples](/examples/ranges)** - Real-world range download scenarios
