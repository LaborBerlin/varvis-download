# Examples

Practical examples and usage patterns for the Varvis Download CLI tool.

## Quick Start Examples

### Basic Downloads

```bash
# Download BAM files for a single analysis
./varvis-download.js -t laborberlin -a 12345

# Download multiple analyses
./varvis-download.js -t laborberlin -a "12345,67890,11111"

# Download specific file types
./varvis-download.js -t laborberlin -a 12345 -f "vcf.gz,vcf.gz.tbi"
```

### Authentication Examples

```bash
# Using environment variables (recommended)
export VARVIS_USER="your_username"
export VARVIS_PASSWORD="your_password"
./varvis-download.js -t laborberlin -a 12345

# Interactive password prompt
./varvis-download.js -t laborberlin -u your_username -a 12345
```

## Example Categories

### [Basic Usage](/examples/basic)

Essential commands and common operations including:

- Simple downloads
- File type selection
- Directory management
- Authentication methods
- Error handling

### Advanced Filtering (Coming Soon)

Complex search and filtering patterns:

- Filter expressions
- Sample ID filtering
- LIMS ID filtering
- Combined search methods

### Genomic Ranges (Coming Soon)

Targeted genomic region downloads:

- Single coordinate ranges
- Multiple region downloads
- BED file integration
- Tool chain integration

### Automation Scripts (Coming Soon)

Production-ready automation examples:

- CI/CD integration
- Batch processing scripts
- Monitoring and reporting
- error recovery workflows

## Real-World Scenarios

### Daily Research Workflow

```bash
#!/bin/bash
# daily-download.sh - Download today's analyses

export VARVIS_USER="${VARVIS_USER}"
export VARVIS_PASSWORD="${VARVIS_PASSWORD}"

DATE=$(date +%Y%m%d)
DEST_DIR="./data/$DATE"

mkdir -p "$DEST_DIR"

# Download all analyses for specific samples
./varvis-download.js \
  -t laborberlin \
  -s "$(cat today_samples.txt | tr '\n' ',')" \
  -d "$DEST_DIR" \
  --reportfile "$DEST_DIR/download_report.json"
```

### Quality Control Check

```bash
#!/bin/bash
# qc-download.sh - Download only high-quality analyses

./varvis-download.js \
  -t laborberlin \
  -s "LB24-001,LB24-002" \
  -F "quality>=95" \
  -F "analysisType=WGS" \
  --list  # Preview before downloading
```

### Archive Recovery

```bash
#!/bin/bash
# recover-archived.sh - Restore and download archived files

./varvis-download.js \
  -t laborberlin \
  -a "12345,67890" \
  --restoreArchived force \
  --logfile archive_recovery.log
```

## Integration Examples

### Docker Container

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY . .
RUN npm install

# Set up bioinformatics tools
RUN apk add --no-cache samtools tabix

ENTRYPOINT ["./varvis-download.js"]
```

### GitHub Actions

```yaml
name: Download Genomic Data

on:
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM

jobs:
  download:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Download data
        env:
          VARVIS_USER: ${{ secrets.VARVIS_USER }}
          VARVIS_PASSWORD: ${{ secrets.VARVIS_PASSWORD }}
        run: |
          ./varvis-download.js -t laborberlin -a "${{ env.ANALYSIS_IDS }}"
```

### Python Integration

```python
#!/usr/bin/env python3
import subprocess
import json
import os

def download_varvis_data(analysis_ids, target="laborberlin"):
    """Download data using Varvis CLI from Python"""

    cmd = [
        "./varvis-download.js",
        "-t", target,
        "-a", ",".join(analysis_ids),
        "--reportfile", "download_report.json"
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode == 0:
        # Read download report
        with open("download_report.json") as f:
            report = json.load(f)
        return report
    else:
        raise Exception(f"Download failed: {result.stderr}")

# Usage
if __name__ == "__main__":
    analyses = ["12345", "67890", "11111"]
    report = download_varvis_data(analyses)
    print(f"Downloaded {len(report['files'])} files")
```

## Testing Examples

### Unit Test Setup

```javascript
// test-setup.js
const { spawn } = require('child_process');

function runVarvisDownload(args) {
  return new Promise((resolve, reject) => {
    const process = spawn('./varvis-download.js', args);
    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => (stdout += data.toString()));
    process.stderr.on('data', (data) => (stderr += data.toString()));

    process.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

module.exports = { runVarvisDownload };
```

### Integration Test

```bash
#!/bin/bash
# integration-test.sh

set -e

echo "Testing basic download..."
./varvis-download.js -t laborberlin -a 12345 --list

echo "Testing authentication..."
export VARVIS_USER="test_user"
./varvis-download.js -t laborberlin -a 12345 --list

echo "All tests passed!"
```

## Performance Examples

### Large Dataset Download

```bash
#!/bin/bash
# large-dataset.sh - Optimized for large downloads

# Create organized directory structure
mkdir -p ./data/{bam,vcf,reports}

# Download BAM files first (usually larger)
./varvis-download.js \
  -t laborberlin \
  -a "$(cat large_analysis_list.txt | tr '\n' ',')" \
  -f "bam,bam.bai" \
  -d "./data/bam" \
  --logfile "./data/reports/bam_download.log"

# Then download VCF files
./varvis-download.js \
  -t laborberlin \
  -a "$(cat large_analysis_list.txt | tr '\n' ',')" \
  -f "vcf.gz,vcf.gz.tbi" \
  -d "./data/vcf" \
  --logfile "./data/reports/vcf_download.log"
```

### Monitoring Downloads

```bash
#!/bin/bash
# monitor-downloads.sh

DOWNLOAD_PID=""

# Start download in background
./varvis-download.js -t laborberlin -a "$ANALYSIS_IDS" &
DOWNLOAD_PID=$!

# Monitor disk space and progress
while kill -0 $DOWNLOAD_PID 2>/dev/null; do
  echo "Download running... Disk usage:"
  df -h .
  sleep 30
done

echo "Download completed"
```

## Troubleshooting Examples

### Debug Network Issues

```bash
#!/bin/bash
# debug-network.sh

# Enable maximum logging
./varvis-download.js \
  -t laborberlin \
  -a 12345 \
  --loglevel debug \
  --logfile debug_network.log \
  --list

# Analyze log for network issues
grep -i "error\|timeout\|connection" debug_network.log
```

### Retry Failed Downloads

```bash
#!/bin/bash
# retry-failed.sh

# First attempt
if ! ./varvis-download.js -t laborberlin -a "$ANALYSIS_IDS"; then
  echo "First attempt failed, retrying in 5 minutes..."
  sleep 300

  # Retry with different settings
  ./varvis-download.js \
    -t laborberlin \
    -a "$ANALYSIS_IDS" \
    --loglevel debug \
    --logfile retry.log
fi
```

## Next Steps

- **[Basic Usage](/examples/basic)** - Start with essential commands
- **[Getting Started Guide](/guide/getting-started)** - Complete setup walkthrough
- **[API Reference](/api/)** - Detailed parameter documentation

## Contributing Examples

Have a useful example or workflow? We welcome contributions!

1. Fork the repository
2. Add your example to the appropriate section
3. Test the example thoroughly
4. Submit a pull request

Examples should be:

- Complete and functional
- Well-commented
- Include expected output when helpful
- Follow security best practices
