#!/usr/bin/env bash
# remote-baseline.sh — Probe orvel-qa-dev (rloovjtdaqvcgzlbppfr) on 4 dimensions
#
# Exit codes:
#   0 — all probes passed (empty project)
#   1 — tables found
#   2 — functions found
#   4 — secrets found
#   8 — buckets found
#   Bitwise OR of the above for multiple failures
#   255 — connection/access error
#
# Usage: ./remote-baseline.sh
# Requires: supabase CLI or psql with connection string,
#           or use MCP execute_sql as fallback.

set -euo pipefail

PROJECT_REF="rloovjtdaqvcgzlbppfr"
EXIT_CODE=0

echo "=== remote-baseline.sh ==="
echo "Project: orvel-qa-dev ($PROJECT_REF)"
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# --- Dimension 1: Tables in public schema ---
echo "--- Tables ---"
# Prefer supabase CLI; fall back to psql if available
TABLES=$(psql -X -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" 2>/dev/null || echo "error")
if [ "$TABLES" = "error" ] || [ -z "$TABLES" ]; then
  echo "  ERROR: Cannot query tables (psql not configured)"
  EXIT_CODE=255
else
  echo "  tables=$TABLES"
  if [ "$TABLES" -ne 0 ]; then
    EXIT_CODE=$((EXIT_CODE + 1))
  fi
fi

# --- Dimension 2: Edge Functions ---
echo ""
echo "--- Functions ---"
FUNCTIONS=$(supabase functions list --project-ref "$PROJECT_REF" 2>/dev/null | jq length 2>/dev/null || echo "error")
if [ "$FUNCTIONS" = "error" ]; then
  echo "  ERROR: Cannot query functions (supabase CLI not configured)"
  EXIT_CODE=255
else
  echo "  functions=$FUNCTIONS"
  if [ "$FUNCTIONS" -ne 0 ]; then
    EXIT_CODE=$((EXIT_CODE + 2))
  fi
fi

# --- Dimension 3: Secrets ---
echo ""
echo "--- Secrets ---"
SECRETS=$(supabase secrets list --project-ref "$PROJECT_REF" 2>/dev/null | wc -l 2>/dev/null || echo "error")
if [ "$SECRETS" = "error" ]; then
  echo "  ERROR: Cannot query secrets (supabase CLI not configured)"
  EXIT_CODE=255
else
  echo "  secrets=$SECRETS"
  if [ "$SECRETS" -ne 0 ]; then
    EXIT_CODE=$((EXIT_CODE + 4))
  fi
fi

# --- Dimension 4: Storage buckets ---
echo ""
echo "--- Buckets ---"
BUCKETS=$(supabase storage ls 2>/dev/null | wc -l || echo "error")
if [ "$BUCKETS" = "error" ]; then
  echo "  ERROR: Cannot query buckets (supabase CLI not configured)"
  EXIT_CODE=255
else
  echo "  buckets=$BUCKETS"
  if [ "$BUCKETS" -ne 0 ]; then
    EXIT_CODE=$((EXIT_CODE + 8))
  fi
fi

echo ""
echo "--- Summary ---"
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "  empty: tables=0 functions=0 secrets=0 buckets=0"
else
  echo "  exit_code=$EXIT_CODE"
fi
exit "$EXIT_CODE"
