# Filtering & Search

Master the powerful filtering system to precisely select files and analyses based on metadata and custom expressions.

## Filter Overview

Varvis Download CLI provides sophisticated filtering capabilities to help you find exactly the data you need:

- **Metadata filtering** - Filter by analysis properties
- **Sample-based search** - Find analyses by sample identifiers
- **LIMS integration** - Search using laboratory management system IDs
- **Expression syntax** - Complex logical expressions
- **Combinable filters** - Mix multiple filter types

## Basic Search Methods

### By Analysis IDs

Direct download using specific analysis identifiers:

```bash
# Single analysis
./varvis-download.js -t laborberlin -a 12345

# Multiple analyses
./varvis-download.js -t laborberlin -a "12345,67890,11111"

# Range of analyses (if sequential)
./varvis-download.js -t laborberlin -a "12345,12346,12347,12348"
```

### By Sample IDs

Find all analyses for specific samples:

```bash
# Single sample
./varvis-download.js -t laborberlin -s "LB24-001"

# Multiple samples
./varvis-download.js -t laborberlin -s "LB24-001,LB24-002,LB24-003"

# Pattern-based samples
./varvis-download.js -t laborberlin -s "LB24-001,LB24-002" -F "analysisType=SNV"
```

### By LIMS IDs

Search using Laboratory Information Management System identifiers:

```bash
# Single LIMS ID
./varvis-download.js -t laborberlin -l "LIMS_12345"

# Multiple LIMS IDs
./varvis-download.js -t laborberlin -l "LIMS_12345,LIMS_67890"

# Combined with other filters
./varvis-download.js -t laborberlin -l "LIMS_12345" -F "quality>95"
```

## Filter Expressions

### Basic Syntax

Filter expressions use the format: `field operator value`

**Supported operators:**

- `=` - Equals
- `!=` - Not equals
- `>` - Greater than
- `<` - Less than
- `>=` - Greater than or equal
- `<=` - Less than or equal

### Common Filter Fields

| Field          | Type   | Description              | Example Values              |
| -------------- | ------ | ------------------------ | --------------------------- |
| `analysisType` | String | Type of genomic analysis | `SNV`, `CNV`, `SV`, `Panel` |
| `sampleId`     | String | Sample identifier        | `LB24-001`, `Patient_123`   |
| `quality`      | Number | Analysis quality score   | `95`, `88.5`                |
| `coverage`     | Number | Sequencing coverage      | `30`, `100`                 |
| `platform`     | String | Sequencing platform      | `Illumina`, `PacBio`        |
| `runDate`      | Date   | Analysis execution date  | `2024-06-01`                |
| `status`       | String | Analysis status          | `complete`, `ready`         |

### Expression Examples

**Analysis type filtering:**

```bash
# SNV analyses only
./varvis-download.js -t laborberlin -s "LB24-001" -F "analysisType=SNV"

# Exclude CNV analyses
./varvis-download.js -t laborberlin -s "LB24-001" -F "analysisType!=CNV"

# Multiple analysis types
./varvis-download.js -t laborberlin -s "LB24-001" -F "analysisType=SNV" -F "analysisType=Panel"
```

**Quality filtering:**

```bash
# High quality only
./varvis-download.js -t laborberlin -s "LB24-001" -F "quality>=95"

# Quality range
./varvis-download.js -t laborberlin -s "LB24-001" -F "quality>=90" -F "quality<=98"

# Minimum coverage
./varvis-download.js -t laborberlin -s "LB24-001" -F "coverage>30"
```

**Sample ID patterns:**

```bash
# Samples after a certain ID
./varvis-download.js -t laborberlin -l "LIMS_123" -F "sampleId>LB24-0100"

# Specific sample range
./varvis-download.js -t laborberlin -F "sampleId>=LB24-001" -F "sampleId<=LB24-100"
```

## Advanced Filtering

### Multiple Filter Conditions

**AND logic** (all conditions must be true):

```bash
./varvis-download.js -t laborberlin -s "LB24-001" \
  -F "analysisType=SNV" \
  -F "quality>=95" \
  -F "coverage>30"
```

**Complex filtering:**

```bash
# High-quality SNV analyses from recent samples
./varvis-download.js -t laborberlin \
  -F "analysisType=SNV" \
  -F "quality>=95" \
  -F "sampleId>=LB24-2000" \
  -F "status=complete"
```

### Date-based Filtering

**Recent analyses:**

```bash
# Today's analyses
./varvis-download.js -t laborberlin -F "runDate>=$(date +%Y-%m-%d)"

# Last week's analyses
./varvis-download.js -t laborberlin -F "runDate>=$(date -d '7 days ago' +%Y-%m-%d)"

# Specific date range
./varvis-download.js -t laborberlin \
  -F "runDate>=2024-06-01" \
  -F "runDate<=2024-06-30"
```

### Platform-specific Filtering

**By sequencing platform:**

```bash
# Illumina data only
./varvis-download.js -t laborberlin -s "LB24-001" -F "platform=Illumina"

# Exclude PacBio data
./varvis-download.js -t laborberlin -s "LB24-001" -F "platform!=PacBio"

# High-coverage Illumina SNV
./varvis-download.js -t laborberlin -s "LB24-001" \
  -F "platform=Illumina" \
  -F "analysisType=SNV" \
  -F "coverage>=100"
```

## Combining Search Methods

### Mixed Identification

Use multiple identification methods together:

```bash
# Specific analyses + sample search + filters
./varvis-download.js -t laborberlin \
  -a "12345,67890" \
  -s "LB24-001,LB24-002" \
  -l "LIMS_123" \
  -F "analysisType=SNV"
```

### Hierarchical Filtering

Build complex queries step by step:

```bash
# Step 1: Find samples by pattern
./varvis-download.js -t laborberlin -s "LB24-0[0-9][0-9]" --list

# Step 2: Add quality filter
./varvis-download.js -t laborberlin -s "LB24-0[0-9][0-9]" -F "quality>=95" --list

# Step 3: Add analysis type filter
./varvis-download.js -t laborberlin -s "LB24-0[0-9][0-9]" \
  -F "quality>=95" \
  -F "analysisType=SNV" --list

# Step 4: Execute download
./varvis-download.js -t laborberlin -s "LB24-0[0-9][0-9]" \
  -F "quality>=95" \
  -F "analysisType=SNV"
```

## Practical Filter Examples

### Daily Workflow Filtering

**Today's high-quality analyses:**

```bash
#!/bin/bash
# daily_quality_download.sh

TODAY=$(date +%Y-%m-%d)
DEST="./data/quality_$TODAY"

mkdir -p "$DEST"

./varvis-download.js -t laborberlin \
  -F "runDate>=$TODAY" \
  -F "quality>=95" \
  -F "status=complete" \
  -d "$DEST" \
  --reportfile "./reports/quality_$TODAY.json"
```

**Weekly batch processing:**

```bash
#!/bin/bash
# weekly_batch.sh

WEEK_AGO=$(date -d '7 days ago' +%Y-%m-%d)
DEST="./data/weekly_$(date +%Y%m%d)"

mkdir -p "$DEST"

# SNV analyses from the last week
./varvis-download.js -t laborberlin \
  -F "runDate>=$WEEK_AGO" \
  -F "analysisType=SNV" \
  -F "quality>=90" \
  -d "$DEST/snv/"

# Panel analyses from the last week
./varvis-download.js -t laborberlin \
  -F "runDate>=$WEEK_AGO" \
  -F "analysisType=Panel" \
  -F "quality>=95" \
  -d "$DEST/panel/"
```

### Research Project Filtering

**Cancer panel study:**

```bash
# Download all cancer panel analyses for specific samples
./varvis-download.js -t laborberlin \
  -s "$(cat cancer_samples.txt | tr '\n' ',')" \
  -F "analysisType=Panel" \
  -F "coverage>=100" \
  -d "./cancer_study/"
```

**Germline variant calling:**

```bash
# High-coverage germline SNV data
./varvis-download.js -t laborberlin \
  -l "$(cat germline_lims.txt | tr '\n' ',')" \
  -F "analysisType=SNV" \
  -F "coverage>=30" \
  -F "platform=Illumina" \
  -d "./germline_variants/"
```

### Quality Control Filtering

**Failed analysis detection:**

```bash
# Find analyses with quality issues
./varvis-download.js -t laborberlin \
  -F "quality<80" \
  -F "status=complete" \
  --list > failed_analyses.txt

# Review and re-download if needed
cat failed_analyses.txt
```

**Coverage verification:**

```bash
# Find low-coverage analyses
./varvis-download.js -t laborberlin \
  -F "coverage<20" \
  -F "analysisType=SNV" \
  --list > low_coverage.txt

# Download for manual review
./varvis-download.js -t laborberlin \
  -F "coverage<20" \
  -F "analysisType=SNV" \
  -d "./qc_review/"
```

## Performance Optimization

### Efficient Filtering

**Pre-filter with --list:**

```bash
# Check result count before download
./varvis-download.js -t laborberlin -F "analysisType=SNV" --list | wc -l

# If reasonable, proceed with download
./varvis-download.js -t laborberlin -F "analysisType=SNV"
```

**Specific field filtering:**

```bash
# More efficient: filter by indexed fields first
./varvis-download.js -t laborberlin -s "LB24-001" -F "analysisType=SNV"

# Less efficient: complex pattern matching
./varvis-download.js -t laborberlin -F "sampleId>=LB24-0001" -F "sampleId<=LB24-9999"
```

### Batch Filtering

**Process filters in batches:**

```bash
#!/bin/bash
# batch_filter.sh

ANALYSIS_TYPES=("SNV" "CNV" "Panel")
QUALITY_THRESHOLD=95

for TYPE in "${ANALYSIS_TYPES[@]}"; do
    echo "Processing $TYPE analyses..."

    ./varvis-download.js -t laborberlin \
      -F "analysisType=$TYPE" \
      -F "quality>=$QUALITY_THRESHOLD" \
      -d "./data/$TYPE/" \
      --logfile "./logs/${TYPE}_download.log"
done
```

## Filter Debugging

### Verify Filter Logic

**Test filters with --list:**

```bash
# Test each filter component
./varvis-download.js -t laborberlin -F "analysisType=SNV" --list
./varvis-download.js -t laborberlin -F "quality>=95" --list
./varvis-download.js -t laborberlin -F "analysisType=SNV" -F "quality>=95" --list
```

**Debug filter syntax:**

```bash
# Enable debug logging for filter parsing
./varvis-download.js -t laborberlin -F "analysisType=SNV" --loglevel debug --list
```

### Common Filter Issues

**Syntax errors:**

```bash
# Incorrect: missing quotes for multi-word values
./varvis-download.js -t laborberlin -F "analysisType=Targeted Panel"

# Correct: quoted values
./varvis-download.js -t laborberlin -F "analysisType=Targeted Panel"
```

**Type mismatches:**

```bash
# Incorrect: string comparison for numbers
./varvis-download.js -t laborberlin -F "quality>=95.5"

# Correct: numeric comparison
./varvis-download.js -t laborberlin -F "quality>=95"
```

**Field name errors:**

```bash
# Check available fields
./varvis-download.js -t laborberlin -a 12345 --list --loglevel debug

# Look for field names in debug output
```

## Filter Reference

### Complete Field List

| Field          | Type   | Operators                       | Example               |
| -------------- | ------ | ------------------------------- | --------------------- |
| `analysisId`   | String | `=`, `!=`                       | `analysisId=12345`    |
| `analysisType` | String | `=`, `!=`                       | `analysisType=SNV`    |
| `sampleId`     | String | `=`, `!=`, `>`, `<`, `>=`, `<=` | `sampleId>=LB24-001`  |
| `limsId`       | String | `=`, `!=`                       | `limsId=LIMS_123`     |
| `quality`      | Number | `=`, `!=`, `>`, `<`, `>=`, `<=` | `quality>=95`         |
| `coverage`     | Number | `=`, `!=`, `>`, `<`, `>=`, `<=` | `coverage>30`         |
| `platform`     | String | `=`, `!=`                       | `platform=Illumina`   |
| `instrument`   | String | `=`, `!=`                       | `instrument=NovaSeq`  |
| `runDate`      | Date   | `=`, `!=`, `>`, `<`, `>=`, `<=` | `runDate>=2024-06-01` |
| `status`       | String | `=`, `!=`                       | `status=complete`     |
| `fileType`     | String | `=`, `!=`                       | `fileType=bam`        |
| `fileSize`     | Number | `=`, `!=`, `>`, `<`, `>=`, `<=` | `fileSize<1000000000` |

### Operator Details

**String Operators:**

- `=` - Exact match (case-sensitive)
- `!=` - Not equal (case-sensitive)
- `>`, `<`, `>=`, `<=` - Lexicographic comparison

**Numeric Operators:**

- `=`, `!=` - Exact numeric match
- `>`, `<`, `>=`, `<=` - Numeric comparison

**Date Operators:**

- `=`, `!=` - Exact date match (YYYY-MM-DD)
- `>`, `<`, `>=`, `<=` - Chronological comparison

## Integration with Workflows

### Workflow Filtering

**Nextflow parameter filtering:**

```nextflow
params.analysis_type = "SNV"
params.min_quality = 95
params.min_coverage = 30

process DOWNLOAD_FILTERED {
    script:
    """
    varvis-download -t laborberlin \
      -F "analysisType=${params.analysis_type}" \
      -F "quality>=${params.min_quality}" \
      -F "coverage>=${params.min_coverage}"
    """
}
```

**Snakemake filtering:**

```python
rule filter_download:
    params:
        filters=["analysisType={analysis_type}", "quality>={min_quality}"]
    shell:
        """
        varvis-download -t laborberlin \
          $(echo {params.filters} | sed 's/ / -F /g' | sed 's/^/-F /')
        """
```

### Automated Filtering

**Cron job with filters:**

```bash
# crontab entry for daily high-quality downloads
0 6 * * * cd /data/genomics && ./varvis-download.js -t laborberlin -F "runDate>=$(date +%Y-%m-%d)" -F "quality>=95"
```

## Next Steps

- **[Range Downloads](/guide/range-downloads)** - Genomic region extraction
- **[Archive Management](/guide/archive-management)** - Handling archived files
- **[Batch Operations](/guide/batch-operations)** - Large-scale processing
