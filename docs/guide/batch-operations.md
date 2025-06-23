# Batch Operations

The Varvis Download CLI is designed for efficient batch processing, allowing you to download large numbers of files, process multiple analyses, and automate complex workflows.

## Overview

Batch operations enable you to:

- Download multiple analyses simultaneously
- Process lists of samples or LIMS IDs
- Automate routine data collection
- Organize downloads with consistent naming
- Generate comprehensive reports

## Basic Batch Downloads

### Multiple Analysis IDs

Download files for several analyses at once:

```bash
# Comma-separated analysis IDs
./varvis-download.js -t laborberlin -a "12345,67890,11111,22222"

# From a file (one ID per line)
./varvis-download.js -t laborberlin -a "$(cat analysis_ids.txt | tr '\n' ',')"
```

### Multiple Samples

Process all analyses for specific samples:

```bash
# Multiple sample IDs
./varvis-download.js -t laborberlin -s "LB24-001,LB24-002,LB24-003"

# From sample list file
./varvis-download.js -t laborberlin -s "$(cat samples.txt | tr '\n' ',')"
```

### Multiple LIMS IDs

Download using laboratory management system IDs:

```bash
# LIMS ID batch processing
./varvis-download.js -t laborberlin -l "LIMS_001,LIMS_002,LIMS_003"
```

## Batch Processing Scripts

### Basic Batch Script

```bash
#!/bin/bash
# batch-download.sh - Simple batch processing

set -e  # Exit on error

# Configuration
TARGET="laborberlin"
BASE_DIR="./batch_downloads"
LOG_DIR="$BASE_DIR/logs"
DATA_DIR="$BASE_DIR/data"

# Setup directories
mkdir -p "$LOG_DIR" "$DATA_DIR"

# Process analysis list
ANALYSIS_FILE="analysis_list.txt"
if [[ ! -f "$ANALYSIS_FILE" ]]; then
  echo "Error: $ANALYSIS_FILE not found"
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/batch_$TIMESTAMP.log"

echo "Starting batch download at $(date)" | tee "$LOG_FILE"
echo "Processing $(wc -l < $ANALYSIS_FILE) analyses" | tee -a "$LOG_FILE"

# Download all analyses
./varvis-download.js \
  -t "$TARGET" \
  -a "$(cat $ANALYSIS_FILE | tr '\n' ',')" \
  -d "$DATA_DIR" \
  --logfile "$LOG_FILE" \
  --reportfile "$LOG_DIR/report_$TIMESTAMP.json"

echo "Batch download completed at $(date)" | tee -a "$LOG_FILE"
```

### Advanced Batch Script with Error Handling

```bash
#!/bin/bash
# advanced-batch.sh - Batch processing with error recovery

set -o pipefail

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly CONFIG_FILE="$SCRIPT_DIR/batch.config"
readonly RETRY_COUNT=3
readonly RETRY_DELAY=300  # 5 minutes

# Load configuration
if [[ -f "$CONFIG_FILE" ]]; then
  source "$CONFIG_FILE"
else
  echo "Error: Configuration file $CONFIG_FILE not found"
  exit 1
fi

# Logging functions
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "$LOG_FILE" >&2
}

# Download function with retry logic
download_analysis() {
  local analysis_id="$1"
  local attempt=1

  while [[ $attempt -le $RETRY_COUNT ]]; do
    log "Downloading analysis $analysis_id (attempt $attempt/$RETRY_COUNT)"

    if ./varvis-download.js \
      -t "$TARGET" \
      -a "$analysis_id" \
      -d "$DATA_DIR/$analysis_id" \
      --logfile "$LOG_FILE" \
      --reportfile "$REPORT_DIR/report_$analysis_id.json"; then

      log "Successfully downloaded analysis $analysis_id"
      return 0
    else
      error "Failed to download analysis $analysis_id (attempt $attempt)"
      if [[ $attempt -lt $RETRY_COUNT ]]; then
        log "Retrying in $RETRY_DELAY seconds..."
        sleep "$RETRY_DELAY"
      fi
      ((attempt++))
    fi
  done

  error "Failed to download analysis $analysis_id after $RETRY_COUNT attempts"
  echo "$analysis_id" >> "$FAILED_FILE"
  return 1
}

# Main execution
main() {
  local analysis_file="$1"

  if [[ -z "$analysis_file" || ! -f "$analysis_file" ]]; then
    echo "Usage: $0 <analysis_file>"
    echo "Analysis file should contain one analysis ID per line"
    exit 1
  fi

  # Setup
  local timestamp=$(date +%Y%m%d_%H%M%S)
  LOG_FILE="$LOG_DIR/batch_$timestamp.log"
  FAILED_FILE="$LOG_DIR/failed_$timestamp.txt"

  mkdir -p "$LOG_DIR" "$DATA_DIR" "$REPORT_DIR"

  log "Starting batch download"
  log "Processing file: $analysis_file"
  log "Target: $TARGET"
  log "Data directory: $DATA_DIR"

  local total_count=0
  local success_count=0
  local failed_count=0

  # Process each analysis
  while IFS= read -r analysis_id; do
    [[ -z "$analysis_id" || "$analysis_id" =~ ^#.*$ ]] && continue

    ((total_count++))

    if download_analysis "$analysis_id"; then
      ((success_count++))
    else
      ((failed_count++))
    fi
  done < "$analysis_file"

  # Summary
  log "Batch download completed"
  log "Total: $total_count, Success: $success_count, Failed: $failed_count"

  if [[ $failed_count -gt 0 ]]; then
    log "Failed analyses listed in: $FAILED_FILE"
    exit 1
  fi
}

# Configuration validation
validate_config() {
  local required_vars=("TARGET" "DATA_DIR" "LOG_DIR" "REPORT_DIR")

  for var in "${required_vars[@]}"; do
    if [[ -z "${!var}" ]]; then
      error "Required configuration variable $var is not set"
      exit 1
    fi
  done
}

# Run
validate_config
main "$@"
```

### Batch Configuration File

```bash
# batch.config - Configuration for batch operations

# Varvis target
TARGET="laborberlin"

# Directory structure
BASE_DIR="./batch_operations"
DATA_DIR="$BASE_DIR/data"
LOG_DIR="$BASE_DIR/logs"
REPORT_DIR="$BASE_DIR/reports"

# Download settings
FILETYPES="bam,bam.bai,vcf.gz,vcf.gz.tbi"
OVERWRITE="false"

# Archive settings
RESTORE_ARCHIVED="ask"
RESTORATION_FILE="$BASE_DIR/restorations.json"

# Logging
LOG_LEVEL="info"

# Retry settings
RETRY_COUNT=3
RETRY_DELAY=300
```

## Parallel Processing

### GNU Parallel Integration

```bash
#!/bin/bash
# parallel-download.sh - Use GNU parallel for concurrent downloads

ANALYSIS_FILE="analysis_list.txt"
MAX_JOBS=4  # Adjust based on system capacity

# Function to download single analysis
download_single() {
  local analysis_id="$1"
  local log_file="logs/analysis_$analysis_id.log"

  mkdir -p "data/$analysis_id" "logs"

  ./varvis-download.js \
    -t laborberlin \
    -a "$analysis_id" \
    -d "data/$analysis_id" \
    --logfile "$log_file" \
    --reportfile "reports/report_$analysis_id.json"
}

# Export function for parallel
export -f download_single

# Run in parallel
parallel -j "$MAX_JOBS" download_single :::: "$ANALYSIS_FILE"

echo "Parallel download completed"
```

### Custom Parallel Implementation

```bash
#!/bin/bash
# custom-parallel.sh - Custom parallel processing

readonly MAX_CONCURRENT=3
readonly ANALYSIS_FILE="analysis_list.txt"

# Background job tracking
declare -a PIDS=()

# Function to wait for job slot
wait_for_slot() {
  while [[ ${#PIDS[@]} -ge $MAX_CONCURRENT ]]; do
    local finished_pids=()

    for i in "${!PIDS[@]}"; do
      if ! kill -0 "${PIDS[$i]}" 2>/dev/null; then
        wait "${PIDS[$i]}"
        echo "Job ${PIDS[$i]} finished with status $?"
        unset "PIDS[$i]"
      fi
    done

    # Rebuild array without gaps
    PIDS=("${PIDS[@]}")

    sleep 1
  done
}

# Download function
download_background() {
  local analysis_id="$1"

  ./varvis-download.js \
    -t laborberlin \
    -a "$analysis_id" \
    -d "data/$analysis_id" \
    --logfile "logs/analysis_$analysis_id.log" &

  local pid=$!
  PIDS+=("$pid")
  echo "Started download for analysis $analysis_id (PID: $pid)"
}

# Main processing loop
while IFS= read -r analysis_id; do
  [[ -z "$analysis_id" ]] && continue

  wait_for_slot
  download_background "$analysis_id"
done < "$ANALYSIS_FILE"

# Wait for all remaining jobs
for pid in "${PIDS[@]}"; do
  wait "$pid"
  echo "Final job $pid completed"
done

echo "All downloads completed"
```

## Organized Batch Downloads

### Hierarchical Directory Structure

```bash
#!/bin/bash
# organized-batch.sh - Create organized directory structure

create_organized_structure() {
  local analysis_id="$1"
  local sample_id="$2"
  local analysis_type="$3"
  local date="$4"

  # Create hierarchical structure
  local structure="data/$date/$analysis_type/$sample_id/$analysis_id"
  mkdir -p "$structure"

  ./varvis-download.js \
    -t laborberlin \
    -a "$analysis_id" \
    -d "$structure" \
    --logfile "logs/${analysis_id}.log"
}

# Process structured input file
# Format: analysis_id,sample_id,analysis_type,date
while IFS=',' read -r analysis_id sample_id analysis_type date; do
  [[ "$analysis_id" =~ ^#.*$ ]] && continue  # Skip comments

  echo "Processing: $analysis_id ($sample_id, $analysis_type, $date)"
  create_organized_structure "$analysis_id" "$sample_id" "$analysis_type" "$date"
done < structured_analysis_list.csv
```

### Sample File Format

```csv
# structured_analysis_list.csv
# analysis_id,sample_id,analysis_type,date
12345,LB24-001,WGS,2024-06-01
12346,LB24-001,WES,2024-06-01
12347,LB24-002,WGS,2024-06-02
12348,LB24-003,Panel,2024-06-03
```

## Batch Filtering and Selection

### Dynamic Sample Selection

```bash
#!/bin/bash
# dynamic-selection.sh - Dynamic sample filtering

# Get samples from last week
LAST_WEEK=$(date -d '7 days ago' '+%Y-%m-%d')

# Download recent high-quality analyses
./varvis-download.js \
  -t laborberlin \
  -F "date>=$LAST_WEEK" \
  -F "quality>=95" \
  -F "analysisType=WGS" \
  --list > recent_analyses.txt

# Process the results
if [[ -s recent_analyses.txt ]]; then
  echo "Found $(grep -c "Analysis ID" recent_analyses.txt) recent analyses"

  # Extract analysis IDs and download
  grep "Analysis ID:" recent_analyses.txt | \
    cut -d: -f2 | \
    tr -d ' ' | \
    tr '\n' ',' | \
    xargs -I {} ./varvis-download.js -t laborberlin -a "{}"
else
  echo "No recent high-quality analyses found"
fi
```

### Conditional Batch Processing

```bash
#!/bin/bash
# conditional-batch.sh - Conditional processing based on criteria

process_sample_batch() {
  local sample_id="$1"
  local output_dir="data/$sample_id"

  mkdir -p "$output_dir"

  # List available analyses for sample
  ./varvis-download.js \
    -t laborberlin \
    -s "$sample_id" \
    --list > "$output_dir/available.txt"

  # Check if WGS analysis is available
  if grep -q "WGS" "$output_dir/available.txt"; then
    echo "WGS analysis found for $sample_id, downloading..."

    ./varvis-download.js \
      -t laborberlin \
      -s "$sample_id" \
      -F "analysisType=WGS" \
      -d "$output_dir"
  else
    echo "No WGS analysis for $sample_id, skipping"
  fi
}

# Process sample list
while IFS= read -r sample_id; do
  [[ -z "$sample_id" ]] && continue
  process_sample_batch "$sample_id"
done < sample_list.txt
```

## Batch Reporting and Monitoring

### Comprehensive Batch Report

```bash
#!/bin/bash
# batch-report.sh - Generate comprehensive batch report

generate_batch_report() {
  local report_dir="$1"
  local output_file="$2"

  cat > "$output_file" << EOF
# Batch Download Report
Generated: $(date)

## Summary
EOF

  # Count total files
  local total_files=$(find "$report_dir" -name "report_*.json" | wc -l)
  echo "Total download reports: $total_files" >> "$output_file"

  # Aggregate statistics
  python3 << 'PYTHON_EOF' >> "$output_file"
import json
import glob
from collections import defaultdict

stats = defaultdict(int)
file_types = defaultdict(int)
total_size = 0

for report_file in glob.glob("reports/report_*.json"):
    try:
        with open(report_file) as f:
            data = json.load(f)

        stats['total_downloads'] += len(data.get('files', []))
        stats['successful'] += data.get('successful', 0)
        stats['failed'] += data.get('failed', 0)

        for file_info in data.get('files', []):
            file_type = file_info.get('type', 'unknown')
            file_types[file_type] += 1
            total_size += file_info.get('size', 0)

    except Exception as e:
        stats['report_errors'] += 1

print(f"\n## Statistics")
print(f"Total files downloaded: {stats['total_downloads']}")
print(f"Successful downloads: {stats['successful']}")
print(f"Failed downloads: {stats['failed']}")
print(f"Total size: {total_size / (1024**3):.2f} GB")

print(f"\n## File Types")
for file_type, count in sorted(file_types.items()):
    print(f"- {file_type}: {count}")
PYTHON_EOF

  echo "" >> "$output_file"
  echo "## Recent Errors" >> "$output_file"

  # Extract recent errors from logs
  find logs -name "*.log" -mtime -1 -exec grep -l "ERROR" {} \; | \
    head -5 | \
    while read log_file; do
      echo "### $(basename $log_file)" >> "$output_file"
      grep "ERROR" "$log_file" | tail -3 >> "$output_file"
      echo "" >> "$output_file"
    done
}

# Generate report
generate_batch_report "reports" "batch_summary.md"
echo "Batch report generated: batch_summary.md"
```

### Real-time Monitoring

```bash
#!/bin/bash
# batch-monitor.sh - Monitor batch operations in real-time

monitor_batch() {
  local pid_file="$1"
  local log_dir="$2"

  echo "Monitoring batch operation..."
  echo "PID file: $pid_file"
  echo "Log directory: $log_dir"
  echo ""

  while [[ -f "$pid_file" ]]; do
    clear
    echo "Batch Download Monitor - $(date)"
    echo "=========================="

    # Count completed downloads
    local completed=$(find "$log_dir" -name "*.log" -exec grep -l "Download completed" {} \; | wc -l)
    local total_logs=$(find "$log_dir" -name "*.log" | wc -l)

    echo "Progress: $completed/$total_logs downloads completed"

    # Show recent activity
    echo ""
    echo "Recent Activity:"
    echo "---------------"
    find "$log_dir" -name "*.log" -mmin -5 -exec tail -1 {} \; | \
      grep -E "(completed|failed|started)" | \
      tail -5

    # Show current disk usage
    echo ""
    echo "Disk Usage:"
    echo "-----------"
    df -h . | tail -1

    sleep 30
  done

  echo "Batch operation completed"
}

# Usage: ./batch-monitor.sh batch.pid logs/
monitor_batch "$1" "$2"
```

## CI/CD Integration

### GitHub Actions Batch Workflow

```yaml
# .github/workflows/batch-download.yml
name: Batch Download

on:
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM
  workflow_dispatch:
    inputs:
      analysis_list:
        description: 'Comma-separated analysis IDs'
        required: true
        type: string

jobs:
  batch-download:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Create analysis list
        run: |
          if [[ -n "${{ github.event.inputs.analysis_list }}" ]]; then
            echo "${{ github.event.inputs.analysis_list }}" | tr ',' '\n' > analysis_list.txt
          else
            # Use default list or fetch from API
            echo "12345\n67890\n11111" > analysis_list.txt
          fi

      - name: Run batch download
        env:
          VARVIS_USER: ${{ secrets.VARVIS_USER }}
          VARVIS_PASSWORD: ${{ secrets.VARVIS_PASSWORD }}
        run: |
          ./batch-download.sh analysis_list.txt

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: batch-download-results
          path: |
            batch_downloads/data/
            batch_downloads/reports/
```

### Docker Batch Container

```dockerfile
# Dockerfile.batch
FROM node:20-alpine

# Install bioinformatics tools
RUN apk add --no-cache \
    samtools \
    bash \
    curl \
    python3 \
    py3-pip

WORKDIR /app

# Copy application
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN chmod +x varvis-download.js batch-download.sh

# Create volume for data
VOLUME ["/data"]

# Default command
ENTRYPOINT ["./batch-download.sh"]
```

```bash
# Build and run batch container
docker build -f Dockerfile.batch -t varvis-batch .

# Run batch operation
docker run -v $(pwd)/data:/data \
  -e VARVIS_USER="$VARVIS_USER" \
  -e VARVIS_PASSWORD="$VARVIS_PASSWORD" \
  varvis-batch analysis_list.txt
```

## Best Practices

### Planning Batch Operations

1. **Resource Management**: Monitor disk space and network bandwidth
2. **Rate Limiting**: Avoid overwhelming the API with too many concurrent requests
3. **Error Handling**: Implement robust retry logic and error recovery
4. **Logging**: Maintain detailed logs for troubleshooting and auditing

### Performance Optimization

1. **Chunking**: Break large batches into smaller chunks
2. **Prioritization**: Download critical files first
3. **Parallel Processing**: Use appropriate concurrency levels
4. **Caching**: Avoid re-downloading existing files

### Monitoring and Maintenance

1. **Progress Tracking**: Monitor batch progress in real-time
2. **Resource Monitoring**: Track disk usage, memory, and network
3. **Cleanup**: Regularly clean up old logs and temporary files
4. **Reporting**: Generate comprehensive reports for analysis

## Related Documentation

- **[Archive Management](/guide/archive-management)** - Handling archived files in batches
- **[Configuration](/guide/configuration)** - Batch-specific configuration options
- **[Logging & Reports](/guide/logging)** - Monitoring batch operations
- **[Examples](/examples/basic)** - Simple batch operation examples
