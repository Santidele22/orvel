#!/usr/bin/env bash
# ============================================================================
# Contract Test Runner — Release 2.0 Phase 2
# ============================================================================
#
# Runs all contract SQL tests via the Supabase MCP (execute_sql).
# Each test is a SQL file that returns rows on success and errors on failure.
#
# Usage:
#   bash supabase/tests/run-contracts.sh
#
# Exit codes:
#   0 — all tests pass
#   1 — one or more tests fail
# ============================================================================

set -euo pipefail

TESTS_DIR="supabase/tests/contract"
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

passed=0
failed=0
failed_tests=()

echo "=============================================="
echo " Contract Test Suite — Release 2.0 Phase 2"
echo "=============================================="
echo ""

for test_file in "$TESTS_DIR"/*.sql; do
  test_name=$(basename "$test_file" .sql)
  echo -n "  $test_name ... "

  # Run the SQL test via MCP
  # NOTE: This is a dry-run simulation. In CI, this would use
  # supabase db query or psql against the target environment.
  if output=$(psql -X -q -c "$(cat "$test_file")" 2>/dev/null); then
    echo -e "  ${GREEN}PASS${NC}"
    passed=$((passed + 1))
  else
    echo -e "  ${RED}FAIL${NC}"
    echo "    $output"
    failed=$((failed + 1))
    failed_tests+=("$test_name")
  fi
done

echo ""
echo "--- Results ---"
echo "  Passed: $passed"
echo "  Failed: $failed"

if [ "$failed" -gt 0 ]; then
  echo "  Failed tests:"
  for t in "${failed_tests[@]}"; do
    echo "    - $t"
  done
  exit 1
fi

exit 0
