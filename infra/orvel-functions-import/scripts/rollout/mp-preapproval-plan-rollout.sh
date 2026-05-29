#!/usr/bin/env bash
set -euo pipefail

TARGET_PERCENT="${1:-}"

if [[ -z "${TARGET_PERCENT}" ]]; then
  echo "Usage: $0 <10|50|100>"
  exit 1
fi

case "${TARGET_PERCENT}" in
  10|50|100) ;;
  *)
    echo "Invalid rollout percent. Allowed values: 10|50|100"
    exit 1
    ;;
esac

echo "Setting Mercado Pago rollout to ${TARGET_PERCENT}%"
supabase secrets set MP_PREAPPROVAL_PLAN_ROLLOUT_PERCENT="${TARGET_PERCENT}"
echo "Done. Verify canary metrics before promoting traffic."
