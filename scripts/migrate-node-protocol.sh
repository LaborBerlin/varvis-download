#!/bin/bash
# =========================================================================
# Migrate Node.js built-in imports to node: protocol
# Per Node.js 22 best practices and Unicorn recommendations
# =========================================================================

set -e

echo "🔄 Migrating built-in imports to node: protocol..."
echo ""

# Node.js built-in modules list (Node.js 22)
BUILTINS=(
  "assert" "async_hooks" "buffer" "child_process" "cluster" "console"
  "constants" "crypto" "dgram" "diagnostics_channel" "dns" "domain"
  "events" "fs" "http" "http2" "https" "inspector" "module" "net"
  "os" "path" "perf_hooks" "process" "punycode" "querystring" "readline"
  "repl" "stream" "string_decoder" "timers" "tls" "trace_events" "tty"
  "url" "util" "v8" "vm" "wasi" "worker_threads" "zlib"
)

# Backup original files
echo "📦 Creating backups..."
find js/ -name "*.cjs" -type f -exec cp {} {}.bak \;
find . -maxdepth 1 -name "*.cjs" -type f -exec cp {} {}.bak \;

echo "🔧 Applying migrations..."
CHANGED=0

for builtin in "${BUILTINS[@]}"; do
  # Count occurrences before migration
  COUNT=$(grep -r "require('$builtin')" js/ *.cjs 2>/dev/null | wc -l || true)

  if [ "$COUNT" -gt 0 ]; then
    echo "  ├─ Migrating require('$builtin') → require('node:$builtin') ($COUNT occurrences)"

    # Replace in js/ directory
    find js/ -name "*.cjs" -type f -exec sed -i "s/require('$builtin')/require('node:$builtin')/g" {} \;

    # Replace in root .cjs files
    find . -maxdepth 1 -name "*.cjs" -type f -exec sed -i "s/require('$builtin')/require('node:$builtin')/g" {} \;

    CHANGED=$((CHANGED + COUNT))
  fi
done

echo ""
if [ $CHANGED -gt 0 ]; then
    echo "✅ Migration complete: $CHANGED imports updated"
    echo ""
    echo "Next steps:"
    echo "  1. Run: make lint-fix"
    echo "  2. Run: make test"
    echo "  3. If tests pass, remove backups: rm js/*.bak *.bak"
    echo "  4. If tests fail, restore: mv js/*.bak js/*.cjs && mv *.bak *.cjs"
else
    echo "ℹ️  No migrations needed - all imports already use node: protocol"
    rm -f js/*.bak *.bak
fi
