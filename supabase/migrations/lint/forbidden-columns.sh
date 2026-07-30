#!/usr/bin/env bash
# ============================================================================
# forbidden-columns.sh — Schema Compliance Lint for Orvel Release 2.0
# ============================================================================
#
# Enforces the forbidden-columns contract from ADR 0001 (Schema Principles)
# and the locked design decisions from ADR 0002.
#
# Exit codes:
#   0 — PASS (no violations found)
#   1 — FAIL (one or more violations detected)
#
# Usage:
#   bash supabase/migrations/lint/forbidden-columns.sh
#
# The script searches ALL *.sql files under supabase/migrations/ (including
# subdirectories) for forbidden patterns.
#
# Reference:
#   - ADR 0001 §P1 (single-tenant MVP — no tenant_id)
#   - ADR 0001 §Additional locked decisions (no per-row color tokens,
#     per-service timing on services, business_settings flat)
#   - ADR 0002 (table definitions)
#   - spec.md Requirements R1 (single-tenant), R2 (no color_hex),
#     R3 (N:M join), R5 (business_settings flat), R6 (per-service timing),
#     R7 (auto_assign_professional DEFAULT false)
# ============================================================================

set -euo pipefail

MIGRATIONS_DIR="supabase/migrations"
# Exclude _legacy/ subdirectory from lint (legacy archive, not subject to 2.0 rules)
EXCLUDE_PATH="_legacy"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

violations=0
report_lines=()

check_pattern() {
    local pattern="$1"
    local message="$2"
    local file_match

    # Search all .sql files recursively from MIGRATIONS_DIR
    while IFS= read -r -d '' file; do
        if grep -q "$pattern" "$file" 2>/dev/null; then
            echo -e "  ${RED}FAIL${NC} $file: $message (matches: $(grep -c "$pattern" "$file"))"
            report_lines+=("FAIL: $file — $message")
            violations=$((violations + 1))
        fi
    done < <(find "$MIGRATIONS_DIR" -path "*/${EXCLUDE_PATH}/*" -prune -o -name '*.sql' -print0 2>/dev/null)
}

check_business_settings_auto_assign() {
    # auto_assign_professional on business_settings MUST have DEFAULT false
    while IFS= read -r -d '' file; do
        # Check if auto_assign_professional appears in a business_settings context
        if grep -q "auto_assign_professional" "$file" 2>/dev/null; then
            # Extract the full column definition to check for DEFAULT false
            # We look for lines containing auto_assign_professional that do NOT include "DEFAULT false"
            local bad_lines
            bad_lines=$(grep -n "auto_assign_professional" "$file" | grep -iv "default false" || true)
            if [ -n "$bad_lines" ]; then
                echo -e "  ${RED}FAIL${NC} $file: auto_assign_professional without DEFAULT false"
                echo "$bad_lines" | while IFS= read -r line; do
                    echo "         $line"
                done
                report_lines+=("FAIL: $file — auto_assign_professional without DEFAULT false")
                violations=$((violations + 1))
            fi
        fi
    done < <(find "$MIGRATIONS_DIR" -path "*/${EXCLUDE_PATH}/*" -prune -o -name '*.sql' -print0 2>/dev/null)
}

check_slot_buffer_on_business_settings() {
    # slot_duration_minutes and buffer_minutes must ONLY appear on services,
    # NOT on business_settings
    while IFS= read -r -d '' file; do
        # Check if slot_duration_minutes appears in a business_settings context
        if grep -q "slot_duration_minutes" "$file" 2>/dev/null; then
            # Check if business_settings context contains slot_duration_minutes
            # by looking for both patterns in the same file
            local bt_lines
            bt_lines=$(grep -n "slot_duration_minutes" "$file" | grep -i "business_settings" || true)
            if [ -n "$bt_lines" ]; then
                echo -e "  ${RED}FAIL${NC} $file: slot_duration_minutes on business_settings (per-service timing violation)"
                echo "$bt_lines"
                report_lines+=("FAIL: $file — slot_duration_minutes on business_settings")
                violations=$((violations + 1))
            fi
        fi

        # Also check buffer_minutes on business_settings
        if grep -q "buffer_minutes" "$file" 2>/dev/null; then
            local bt_lines2
            bt_lines2=$(grep -n "buffer_minutes" "$file" | grep -i "business_settings" || true)
            if [ -n "$bt_lines2" ]; then
                echo -e "  ${RED}FAIL${NC} $file: buffer_minutes on business_settings (per-service timing violation)"
                echo "$bt_lines2"
                report_lines+=("FAIL: $file — buffer_minutes on business_settings")
                violations=$((violations + 1))
            fi
        fi
    done < <(find "$MIGRATIONS_DIR" -path "*/${EXCLUDE_PATH}/*" -prune -o -name '*.sql' -print0 2>/dev/null)
}

echo "=============================================="
echo " forbidden-columns.sh — Schema Compliance Lint"
echo "=============================================="
echo ""

# Forbidden patterns (absolute — banned anywhere in migration files)
echo "--- Checking forbidden patterns (absolute) ---"

check_pattern 'color_hex' "color_hex is forbidden (R2 — no per-row color tokens)"

check_pattern 'slot_interval_minutes' "slot_interval_minutes is forbidden (legacy column, not in 2.0)"

check_pattern 'min_notice_minutes' "min_notice_minutes is forbidden (legacy business_settings knob)"

check_pattern 'selected_business_types' "selected_business_types is forbidden (legacy per-rubric variant)"

check_pattern 'allow_client_professional_selection' "allow_client_professional_selection is forbidden (legacy per-rubric variant)"

check_pattern 'tenant_id' "tenant_id is forbidden (P1 — single-tenant MVP, no row-level discriminator)"

echo ""
echo "--- Checking business_settings special rules ---"

check_business_settings_auto_assign

check_slot_buffer_on_business_settings

echo ""

# Summary
if [ "$violations" -eq 0 ]; then
    echo -e "${GREEN}PASS${NC} — All schema compliance checks passed."
    exit 0
else
    echo -e "${RED}FAIL${NC} — $violations violation(s) detected."
    echo ""
    echo "Violation summary:"
    printf '%s\n' "${report_lines[@]}"
    exit 1
fi
