# Archive Management

The Varvis Download CLI provides comprehensive tools for managing archived files, including restoration requests, tracking, and automated workflows.

## Understanding Archives

### What are Archived Files?

Archived files are older data files that have been moved to long-term storage to save space on primary storage systems. These files:

- Are not immediately available for download
- Require restoration before downloading
- May take time to become available (minutes to hours)
- Are typically older analysis results

### Archive Status Indicators

When listing files, archived files are marked:

```bash
./varvis-download.cjs -t mytarget -a 12345 --list

# Output example:
Analysis ID: 12345
Available files:
  - sample_001.bam (1.2 GB) [ARCHIVED]
  - sample_001.bam.bai (4.5 MB)
  - sample_001.vcf.gz (125 MB) [ARCHIVED]
  - sample_001.vcf.gz.tbi (2.1 MB)
```

## Archive Restoration Modes

### Ask Mode (Default)

Prompts for each archived file:

```bash
./varvis-download.cjs -t mytarget -a 12345
# Prompts: "File sample_001.bam is archived. Restore? [y/N]"
```

::: warning Non-interactive runs
`ask` needs a terminal. On a non-TTY (CI, cron, a pipe), the default `ask` is
automatically downgraded to `no` — archived files are skipped and a warning
explains how to restore them (`--restoreArchived force`), while non-archived
files still download. An **explicit** `--restoreArchived ask` or `all` on a
non-TTY fails fast instead, since it asks for interactivity the environment
cannot provide.
:::

### All Mode

Prompts once for all archived files, then applies decision to all:

```bash
./varvis-download.cjs -t mytarget -a 12345 --restoreArchived all
# Prompts: "Restore all archived files? (y/n): y"
# Logs: "User decision for all archived files: restore"
# Logs: "Restoring archived file sample_001.bam due to --restoreArchived=all decision"
```

### Force Mode

Restores archived files without confirmation:

```bash
./varvis-download.cjs -t mytarget -a 12345 --restoreArchived force
# Logs: "Force restoring archived file sample_001.bam due to --restoreArchived=force"
```

### No Mode

Skips all archived files:

```bash
./varvis-download.cjs -t mytarget -a 12345 --restoreArchived no
# Logs: "Skipping archived file sample_001.bam due to --restoreArchived=no"
```

### Enhanced Logging

All restoration decisions are clearly logged for audit trails:

- **Decision tracking** - Each file shows why it was restored/skipped
- **User input logging** - Interactive decisions are recorded
- **Context preservation** - All saved options visible in logs
- **Resume clarity** - Resume operations show restored context usage

## Restoration Tracking

### Tracking File

The tool maintains a JSON file to track restoration requests:

```bash
# Default tracking file
./varvis-download.cjs -t mytarget -a 12345 --restorationFile "my-restorations.json"
```

### Tracking File Format

The restoration tracking file preserves all context needed to resume downloads exactly as originally requested:

```json
[
  {
    "analysisId": "12345",
    "fileName": "sample_001.bam",
    "restoreEstimation": "2024-06-24T15:30:00Z",
    "options": {
      "destination": "/custom/download/path",
      "overwrite": true,
      "range": "chr1:1000000-2000000",
      "bed": null,
      "restorationFile": "awaiting-restoration.json",
      "filetypes": ["bam", "bam.bai"]
    }
  }
]
```

### State Preservation Features

The restoration system preserves complete download context:

- **Destination paths** - Files download to original destination
- **Overwrite settings** - Original overwrite preferences preserved
- **Genomic ranges** - Ranged downloads use original ranges/BED files
- **File type filters** - Only originally requested file types downloaded
- **All CLI options** - Complete context restored for consistent behavior

## Resume Archived Downloads

The resume function automatically detects when restored files become available and downloads them using the exact same context (destination, ranges, file types) as the original request.

### Basic Resume

Resume previously requested archived downloads using default tracking file:

```bash
./varvis-download.cjs --resumeArchivedDownloads -t mytarget -u username -p password
```

### Resume with Custom Tracking File

```bash
./varvis-download.cjs --resumeArchivedDownloads --restorationFile "project-a-restorations.json" -t mytarget -u username -p password
```

### Context Restoration Examples

**Original ranged download request:**

```bash
./varvis-download.cjs -t mytarget -a 12345 -g "chr1:1000000-2000000" -d "/project/ranged" --restoreArchived force
```

**Resume will automatically:**

- Download to `/project/ranged` (preserved destination)
- Extract only `chr1:1000000-2000000` region (preserved range)
- Use ranged download workflow (preserved context)

**Original VCF download with custom filetypes:**

```bash
./varvis-download.cjs -t mytarget -a 12345 -f "vcf.gz,vcf.gz.tbi" -d "/vcf/data" --restoreArchived all
```

**Resume will automatically:**

- Download only VCF and index files (preserved filetypes)
- Save to `/vcf/data` (preserved destination)
- Use VCF-specific workflow (preserved context)

## Complete Archive Workflow Example

This example demonstrates the full archive workflow with state preservation:

### Step 1: Initial Request with Custom Settings

```bash
# Request ranged BAM download with custom destination
./varvis-download.cjs \
  -t mytarget \
  -a 12345 \
  -g "chr1:1000000-2000000 chr2:5000000-6000000" \
  -d "/project/genomics/chr1-2" \
  -f "bam,bam.bai" \
  --overwrite \
  --restoreArchived force \
  --restorationFile "genomics-project.json"

# Output:
# ⚠ File sample_001.bam for analysis 12345 is archived.
# ℹ Force restoring archived file sample_001.bam due to --restoreArchived=force
# ℹ Restoration initiated for analysis 12345. Expected availability: 2024-06-24T16:30:00Z
```

### Step 2: Check Restoration Status

```bash
# Check what's in the restoration file
cat genomics-project.json
```

```json
[
  {
    "analysisId": "12345",
    "fileName": "sample_001.bam",
    "restoreEstimation": "2024-06-24T16:30:00Z",
    "options": {
      "destination": "/project/genomics/chr1-2",
      "overwrite": true,
      "range": "chr1:1000000-2000000 chr2:5000000-6000000",
      "bed": null,
      "restorationFile": "genomics-project.json",
      "filetypes": ["bam", "bam.bai"]
    }
  }
]
```

### Step 3: Resume When Ready

```bash
# Resume downloads (run after restoration time)
./varvis-download.cjs \
  --resumeArchivedDownloads \
  --restorationFile "genomics-project.json" \
  -t mytarget \
  -u username \
  -p password

# Output:
# ℹ Starting in archive resumption mode.
# ℹ Resuming archived downloads as requested.
# ℹ Resuming download for analysis 12345, file sample_001.bam
# ℹ Performing ranged download for restored BAM file: sample_001.bam
# ℹ Successfully resumed download for analysis 12345, file sample_001.bam
# ℹ Updated restoration file genomics-project.json - 0 entries remaining
```

### Result

The file downloads exactly as originally requested:

- **Location**: `/project/genomics/chr1-2/sample_001.ranged.bam`
- **Content**: Only regions chr1:1000000-2000000 and chr2:5000000-6000000
- **Type**: BAM with BAI index (as specified in filetypes)
- **Behavior**: Overwrites existing files (as specified)

## Automation Workflows

### Daily Archive Check Script

```bash
#!/bin/bash
# daily-archive-check.sh

RESTORATION_FILE="daily-restorations.json"
LOG_FILE="archive-$(date +%Y%m%d).log"

echo "Checking for available restored files..."
./varvis-download.cjs \
  --resumeArchivedDownloads \
  --restorationFile "$RESTORATION_FILE" \
  --logfile "$LOG_FILE"

echo "Archive check completed. See $LOG_FILE for details."
```

### Bulk Archive Restoration

```bash
#!/bin/bash
# bulk-restore.sh

ANALYSIS_LIST="archive_analyses.txt"

while IFS= read -r ANALYSIS_ID; do
  echo "Requesting restoration for analysis: $ANALYSIS_ID"

  ./varvis-download.cjs \
    -t mytarget \
    -a "$ANALYSIS_ID" \
    --restoreArchived force \
    --list

  sleep 5  # Rate limiting
done < "$ANALYSIS_LIST"

echo "All restoration requests submitted."
echo "Run with --resumeArchivedDownloads to check status later."
```

### Scheduled Download Script

```bash
#!/bin/bash
# scheduled-download.sh

# For use in cron jobs
# 0 */6 * * * /path/to/scheduled-download.sh

RESTORATION_FILE="/data/restorations/scheduled.json"
DOWNLOAD_DIR="/data/downloads"
LOG_DIR="/var/log/varvis-download"

mkdir -p "$DOWNLOAD_DIR" "$LOG_DIR"

# Check for available restored files every 6 hours
./varvis-download.cjs \
  --resumeArchivedDownloads \
  --restorationFile "$RESTORATION_FILE" \
  -d "$DOWNLOAD_DIR" \
  --logfile "$LOG_DIR/scheduled-$(date +%Y%m%d-%H%M).log"
```

## Advanced Archive Management

### Monitoring Restoration Status

Check restoration status without downloading:

```bash
./varvis-download.cjs \
  --resumeArchivedDownloads \
  --restorationFile "restorations.json" \
  --list
```

### Cleanup Old Restoration Requests

```bash
#!/bin/bash
# cleanup-restorations.sh

RESTORATION_FILE="awaiting-restoration.json"
BACKUP_FILE="restorations-backup-$(date +%Y%m%d).json"

# Backup current file
cp "$RESTORATION_FILE" "$BACKUP_FILE"

# Clean up completed/failed restorations older than 7 days
python3 << 'EOF'
import json
import datetime

# The tracking file is a top-level array of entries:
#   {analysisId, fileName, restoreEstimation, options}
with open('awaiting-restoration.json', 'r') as f:
    entries = json.load(f)

now = datetime.datetime.now(datetime.timezone.utc)
cutoff = now - datetime.timedelta(days=7)
kept = []

for e in entries:
    est = datetime.datetime.fromisoformat(e['restoreEstimation'].replace('Z', '+00:00'))
    # Keep entries still pending (not yet ready), or that became ready recently
    if est > now or est > cutoff:
        kept.append(e)

with open('awaiting-restoration.json', 'w') as f:
    json.dump(kept, f, indent=2)

print(f"Cleaned up restoration file. Kept {len(kept)} entries.")
EOF
```

### Archive Statistics

```bash
#!/bin/bash
# archive-stats.sh

echo "Archive Restoration Statistics"
echo "==============================="

RESTORATION_FILE="awaiting-restoration.json"

if [[ -f "$RESTORATION_FILE" ]]; then
  python3 << EOF
import json
import datetime
from collections import Counter

with open('$RESTORATION_FILE', 'r') as f:
    entries = json.load(f)

now = datetime.datetime.now(datetime.timezone.utc)

def state(e):
    est = datetime.datetime.fromisoformat(e['restoreEstimation'].replace('Z', '+00:00'))
    return 'ready' if est <= now else 'pending'

print(f"Total entries: {len(entries)}")
print("\nBy state (derived from restoreEstimation):")
for s, count in Counter(state(e) for e in entries).items():
    print(f"  {s}: {count}")

print("\nBy analysis:")
for analysis_id, count in Counter(e['analysisId'] for e in entries).items():
    print(f"  {analysis_id}: {count}")
EOF
else
  echo "No restoration file found."
fi
```

## Troubleshooting Archives

### Common Issues

**Restoration requests timeout:**

```bash
# Check network connectivity
ping api.varvis.com

# Use debug logging
./varvis-download.cjs -a 12345 --restoreArchived force --loglevel debug
```

**Files not becoming available:**

```bash
# Check restoration status
./varvis-download.cjs --resumeArchivedDownloads --list

# Contact support if files are stuck in pending status for >24 hours
```

**Large restoration tracking files:**

```bash
# Clean up old restorations
./cleanup-restorations.sh

# Or start fresh (backup first)
cp awaiting-restoration.json backup.json
echo '[]' > awaiting-restoration.json
```

### Debug Archive Issues

```bash
#!/bin/bash
# debug-archive.sh

ANALYSIS_ID="$1"
if [[ -z "$ANALYSIS_ID" ]]; then
  echo "Usage: $0 <analysis_id>"
  exit 1
fi

echo "Debugging archive issues for analysis: $ANALYSIS_ID"

# Check file status
echo "1. Checking file availability..."
./varvis-download.cjs -t mytarget -a "$ANALYSIS_ID" --list

# Check restoration tracking
echo "2. Checking restoration history..."
if [[ -f "awaiting-restoration.json" ]]; then
  grep -A5 -B5 "$ANALYSIS_ID" awaiting-restoration.json || echo "No restorations found"
else
  echo "No restoration file found"
fi

# Try restoration with debug logging
echo "3. Testing restoration request..."
./varvis-download.cjs \
  -t mytarget \
  -a "$ANALYSIS_ID" \
  --restoreArchived force \
  --loglevel debug \
  --logfile "debug-archive-$ANALYSIS_ID.log" \
  --list

echo "Debug complete. Check debug-archive-$ANALYSIS_ID.log for details."
```

## Best Practices

### Planning Archive Downloads

1. **Request Early**: Submit restoration requests well before you need the data
2. **Batch Requests**: Request multiple files at once to optimize restoration
3. **Track Requests**: Always use restoration tracking files
4. **Monitor Status**: Check restoration status regularly

### Production Workflows

1. **Separate Tracking**: Use different tracking files for different projects
2. **Automated Monitoring**: Set up scheduled checks for restored files
3. **Cleanup Regularly**: Remove old completed restorations
4. **Backup Tracking**: Keep backups of restoration tracking files

### Error Recovery

1. **Retry Logic**: Implement retry logic for failed restorations
2. **Fallback Options**: Have alternative data sources when possible
3. **Monitoring**: Set up alerts for long-pending restorations
4. **Documentation**: Keep logs of restoration requests and issues

## Integration with Other Tools

### Database Integration

```python
#!/usr/bin/env python3
# archive_db.py - Track restorations in database

import json
import sqlite3
import datetime

def update_restoration_db():
    """Update database with restoration status"""

    conn = sqlite3.connect('restorations.db')
    cursor = conn.cursor()

    # Create table if not exists
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS restorations (
            analysis_id TEXT,
            file_name TEXT,
            restore_estimation TEXT,
            state TEXT,
            PRIMARY KEY (analysis_id, file_name)
        )
    ''')

    # The tracking file is a top-level array of entries
    with open('awaiting-restoration.json', 'r') as f:
        entries = json.load(f)

    now = datetime.datetime.now(datetime.timezone.utc)

    # Update database
    for e in entries:
        est = datetime.datetime.fromisoformat(e['restoreEstimation'].replace('Z', '+00:00'))
        state = 'ready' if est <= now else 'pending'
        cursor.execute('''
            INSERT OR REPLACE INTO restorations
            VALUES (?, ?, ?, ?)
        ''', (
            e['analysisId'],
            e['fileName'],
            e['restoreEstimation'],
            state
        ))

    conn.commit()
    conn.close()

if __name__ == "__main__":
    update_restoration_db()
```

### Monitoring Integration

```bash
#!/bin/bash
# monitoring-integration.sh

# Send metrics to monitoring system. The file is a top-level array; an entry is
# "ready" once its restoreEstimation (ISO-8601 UTC) is in the past.
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PENDING_COUNT=$(jq --arg now "$NOW" '[.[] | select(.restoreEstimation > $now)] | length' awaiting-restoration.json)
AVAILABLE_COUNT=$(jq --arg now "$NOW" '[.[] | select(.restoreEstimation <= $now)] | length' awaiting-restoration.json)

# Example: Send to Prometheus pushgateway
curl -X POST http://pushgateway:9091/metrics/job/varvis-archives \
  --data-binary "varvis_archive_pending_count $PENDING_COUNT"
curl -X POST http://pushgateway:9091/metrics/job/varvis-archives \
  --data-binary "varvis_archive_available_count $AVAILABLE_COUNT"
```

## Related Documentation

- **[Configuration Guide](/guide/configuration)** - Archive-related settings
- **[Batch Operations](/guide/batch-operations)** - Bulk archive management
- **[Logging & Reports](/guide/logging)** - Archive activity logging
- **[Basic Examples](/examples/basic)** - Simple archive operations
