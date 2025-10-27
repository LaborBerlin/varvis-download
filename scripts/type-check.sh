#!/bin/bash
# =========================================================================
# Type Checking Script - Runs TypeScript type checking and reports errors
# =========================================================================

set -e

echo "🔍 Running TypeScript type checking..."
echo ""

# Run type check and capture output
if npm run type-check 2>&1 | tee type-errors.log; then
    # Success
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✓ All type checks passed!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    rm -f type-errors.log
    exit 0
else
    # Failures
    ERROR_COUNT=$(grep -c "error TS" type-errors.log || true)

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "❌ Type Check Failed: $ERROR_COUNT errors found"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Common fixes:"
    echo "  1. Add missing @param JSDoc tags"
    echo "  2. Use import() types: @param {import('undici').Agent}"
    echo "  3. Add null checks: if (!value) throw new Error(...)"
    echo "  4. Fix return types: @returns {Promise<string>}"
    echo ""
    echo "Review type-errors.log for full details"
    echo ""
    exit 1
fi
