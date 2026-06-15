#!/usr/bin/env bash
set -euo pipefail

TARGET_PERCENT="${1:-10}"

case "${TARGET_PERCENT}" in
50 | 10 | 0) ;;
*)
  echo "Usage: $0 <50|10|0>"
  exit 1
  ;;
esac

echo "Rolling back Mercado Pago rollout to ${TARGET_PERCENT}%"
npx supabase secrets set MP_PREAPPROVAL_PLAN_ROLLOUT_PERCENT="${TARGET_PERCENT}"
echo "Rollback applied. Keep rollout at ${TARGET_PERCENT}% until canary recovers."
