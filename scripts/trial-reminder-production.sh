#!/usr/bin/env bash
set -euo pipefail

readonly_path_overrides=(
  ORVEL_ROOT TRIAL_REMINDER_INVOKE_HELPER TRIAL_REMINDER_SAFE_PREFLIGHT_HELPER
  TRIAL_REMINDER_PREREQUISITE_HELPER TRIAL_REMINDER_EVIDENCE_HELPER
  TRIAL_REMINDER_MIGRATION_HELPER TRIAL_REMINDER_DURABLE_STATE_HELPER
  TRIAL_REMINDER_DRY_RUN_HELPER
  NODE_OPTIONS NODE_PATH
)
for override_name in "${readonly_path_overrides[@]}"; do
  if [[ -n "${!override_name:-}" ]]; then
    echo "Runtime code or repository override is not allowed" >&2
    exit 1
  fi
done
unset "${readonly_path_overrides[@]}"

if ! ulimit -c 0; then
  echo "Unable to disable core dumps" >&2
  exit 1
fi

function_name="send-trial-user-activation-reminder-once"
temporary_secrets=(TRIAL_REMINDER_RECIPIENT_EMAIL TRIAL_REMINDER_BUSINESS_NAME TRIAL_REMINDER_DASHBOARD_URL TRIAL_REMINDER_BOOKING_URL)
: "${CLI_TIMEOUT_SECONDS:=60}"
: "${CLEANUP_VERIFY_ATTEMPTS:=5}"
: "${CLEANUP_VERIFY_DELAY_SECONDS:=1}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
link_ref_file="$root/supabase/.temp/project-ref"
expected_ref_file="$root/supabase/production-project-ref.sha256"
invoke_helper="$root/scripts/trial-reminder-invoke-once.mjs"
secret_file_helper="$root/scripts/trial-reminder-secret-file.mjs"
safe_preflight_helper="$root/scripts/trial-reminder-safe-preflight.mjs"
prerequisite_helper="$root/scripts/trial-reminder-prerequisites.mjs"
evidence_helper="$root/scripts/trial-reminder-evidence.mjs"
evidence_file="$root/supabase/.temp/trial-reminder-production-evidence.json"
migration_helper="$root/scripts/trial-reminder-migration-list.mjs"
dry_run_helper="$root/scripts/trial-reminder-dry-run.mjs"
durable_state_helper="$root/scripts/trial-reminder-durable-state.mjs"
expected_migration="20260712213000"
supabase_cli_version="$(node -p 'require(process.argv[1]).config.supabaseCliVersion' "$root/package.json")"
[[ "$supabase_cli_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Reviewed Supabase CLI version is invalid" >&2; exit 1; }

node "$prerequisite_helper"

resolve_project_ref() {
  [[ -f "$link_ref_file" && -f "$expected_ref_file" ]] || { echo "Production project identity evidence is unavailable" >&2; return 1; }
  local linked expected linked_hash hash_output
  linked="$(tr -d '[:space:]' <"$link_ref_file")"
  expected="$(tr -d '[:space:]' <"$expected_ref_file")"
  hash_output="$(printf '%s' "$linked" | sha256sum)" || { echo "Project identity verification unavailable" >&2; return 1; }
  linked_hash="${hash_output%% *}"
  [[ "$linked" =~ ^[a-z0-9]+$ && "$expected" =~ ^[a-f0-9]{64}$ && "$linked_hash" == "$expected" ]] || {
    echo "Linked project identity mismatch" >&2
    return 1
  }
  printf '%s' "$linked"
}

project_ref="$(resolve_project_ref)"

run_cli() {
  timeout --foreground "${CLI_TIMEOUT_SECONDS}s" npx "supabase@$supabase_cli_version" "$@"
}

record_evidence() {
  node "$evidence_helper" "$evidence_file" "$1" "$2"
}

function_state() {
  local output
  output="$(run_cli functions list --project-ref "$project_ref" --output json)" || return $?
  node -e 'const s=JSON.parse(process.argv[1]);console.log(s.some(x=>x.name===process.argv[2])?"present":"absent")' "$output" "$function_name"
}

secret_state() {
  local output
  output="$(run_cli secrets list --project-ref "$project_ref" --output json)" || return $?
  node -e 'const s=JSON.parse(process.argv[1]);console.log(s.some(x=>x.name===process.argv[2])?"present":"absent")' "$output" "$1"
}

temporary_secret_count() {
  local output
  output="$(run_cli secrets list --project-ref "$project_ref" --output json)" || return $?
  node -e 'const a=JSON.parse(process.argv[1]);const wanted=new Set(["TRIAL_REMINDER_RECIPIENT_EMAIL","TRIAL_REMINDER_BUSINESS_NAME","TRIAL_REMINDER_DASHBOARD_URL","TRIAL_REMINDER_BOOKING_URL"]);const names=a.map(x=>x.name);const scoped=names.filter(x=>x.startsWith("TRIAL_REMINDER_"));if(scoped.length!==wanted.size||scoped.some(x=>!wanted.has(x))||[...wanted].some(x=>!names.includes(x)))process.exit(1);console.log(wanted.size)' "$output"
}

verify_clean() {
  local current_state
  current_state="$(function_state)"
  if [[ "$current_state" == "present" ]]; then
    echo "Temporary function is still deployed" >&2
    exit 1
  fi
  for secret_name in "${temporary_secrets[@]}"; do
    current_state="$(secret_state "$secret_name")"
    if [[ "$current_state" == "present" ]]; then
      echo "Temporary secret is still configured: $secret_name" >&2
      exit 1
    fi
  done
  echo "Temporary function and secrets are absent"
}

wait_for_secret_absent() {
  local secret_name="$1" current_state attempt
  for ((attempt=1; attempt<=CLEANUP_VERIFY_ATTEMPTS; attempt++)); do
    current_state="$(secret_state "$secret_name")"
    [[ "$current_state" == "absent" ]] && return 0
    if ((attempt < CLEANUP_VERIFY_ATTEMPTS)); then sleep "$CLEANUP_VERIFY_DELAY_SECONDS"; fi
  done
  echo "Temporary secret is still configured: $secret_name" >&2
  return 1
}

cleanup_resources() {
  local current_state
  current_state="$(function_state)"
  if [[ "$current_state" == "present" ]]; then
    run_cli functions delete "$function_name" --project-ref "$project_ref" --yes
  fi
  local secrets_to_unset=()
  for secret_name in "${temporary_secrets[@]}"; do
    current_state="$(secret_state "$secret_name")"
    if [[ "$current_state" == "present" ]]; then secrets_to_unset+=("$secret_name"); fi
  done
  if ((${#secrets_to_unset[@]})); then
    run_cli secrets unset "${secrets_to_unset[@]}" --project-ref "$project_ref"
  fi
  for secret_name in "${temporary_secrets[@]}"; do
    wait_for_secret_absent "$secret_name"
  done
  verify_clean
  record_evidence temporary_function_count 0
  record_evidence temporary_secret_count 0
  record_evidence cleanup_status '"verified"'
}

preinvoke_gates() {
  local migration_output
  migration_output="$(run_cli migration list --linked)"
  printf '%s' "$migration_output" | node "$migration_helper" "$expected_migration" >/dev/null
  run_cli db query --linked --file "$root/supabase/checks/trial-user-activation-reminder-preflight-present.sql" >/dev/null
  [[ "$(function_state)" == "present" ]] || { echo "Temporary function gate failed" >&2; return 1; }
  local secret_count
  secret_count="$(temporary_secret_count)" || { echo "Temporary secret gate failed" >&2; return 1; }
  [[ "$secret_count" -eq 4 ]] || return 1
  record_evidence migration_alignment '"aligned"'
  record_evidence zero_attempt true
  record_evidence temporary_function_count 1
  record_evidence temporary_secret_count 4
  local safe_output
  safe_output="$(node "$safe_preflight_helper" "$project_ref")"
  [[ "$safe_output" == "safe_preflight_status=405" ]] || return 1
  record_evidence safe_preflight_status 405
}

setup_temporary_capability() {
  local secret_file="$1"
  node -e 'const fs=require("node:fs");const mode=fs.statSync(process.argv[1]).mode&0o777;if(mode!==0o600)process.exit(1)' "$secret_file"
  node "$secret_file_helper" "$secret_file"
  run_cli secrets set --env-file "$secret_file" --project-ref "$project_ref"
  run_cli functions deploy "$function_name" --project-ref "$project_ref"
}

forward_migrate() {
  local migration_output dry_run_output
  migration_output="$(run_cli migration list --linked)"
  printf '%s' "$migration_output" | node "$migration_helper" "$expected_migration" pending >/dev/null

  run_cli db query --linked --file "$root/supabase/checks/trial-user-activation-reminder-preflight-legacy-applied.sql" >/dev/null

  dry_run_output="$(run_cli db push --linked --dry-run --yes 2>&1)"
  printf '%s' "$dry_run_output" | node "$dry_run_helper" "$expected_migration" >/dev/null

  run_cli db push --linked --yes

  migration_output="$(run_cli migration list --linked)"
  printf '%s' "$migration_output" | node "$migration_helper" "$expected_migration" applied >/dev/null
  run_cli db query --linked --file "$root/supabase/checks/trial-user-activation-reminder-preflight-present.sql" >/dev/null
  echo "forward_migration=PASS"
}

case "${1:-}" in
  diagnose)
    expected_state="${2:-}"
    [[ "$expected_state" == "pristine" || "$expected_state" == "legacy-applied" || "$expected_state" == "present" ]] || { echo "Use diagnose pristine|legacy-applied|present" >&2; exit 2; }
    run_cli migration list --linked
    run_cli db query --linked --file "$root/supabase/checks/trial-user-activation-reminder-preflight-${expected_state}.sql"
    ;;
  forward-migrate)
    forward_migrate
    ;;
  prerequisites)
    echo "host_prerequisites=PASS"
    ;;
  safe-preflight)
    node "$safe_preflight_helper" "$project_ref"
    ;;
  cleanup)
    cleanup_resources
    ;;
  verify-clean)
    verify_clean
    ;;
  evidence)
    run_cli db query --linked --file "$root/supabase/checks/trial-user-activation-reminder-evidence.sql"
    ;;
  record-terminal)
    durable_output="$(run_cli db query --linked --file "$root/supabase/checks/trial-user-activation-reminder-evidence.sql")"
    durable_state="$(printf '%s' "$durable_output" | node "$durable_state_helper")"
    record_evidence durable_state "\"$durable_state\""
    ;;
  prepare-and-invoke)
    secret_file="${2:-}"
    [[ -n "$secret_file" ]] || { echo "Secure secret file is required" >&2; exit 2; }
    node "$evidence_helper" "$evidence_file" init
    trap cleanup_resources EXIT
    setup_temporary_capability "$secret_file"
    preinvoke_gates
    invocation_output="$(node "$invoke_helper" "$project_ref")"
    [[ "$invocation_output" =~ ^invocation_http_status=([0-9]{3})$ ]] || exit 1
    record_evidence invocation_http_status "${BASH_REMATCH[1]}"
    durable_output="$(run_cli db query --linked --file "$root/supabase/checks/trial-user-activation-reminder-evidence.sql")"
    durable_state="$(printf '%s' "$durable_output" | node "$durable_state_helper")"
    record_evidence durable_state "\"$durable_state\""
    echo "$invocation_output"
    echo "durable_state=$durable_state"
    ;;
  recover)
    cleanup_resources
    ;;
  *)
    echo "Usage: $0 {prerequisites|diagnose pristine|legacy-applied|present|forward-migrate|safe-preflight|evidence|record-terminal|prepare-and-invoke SECRET_FILE|recover|cleanup|verify-clean}" >&2
    exit 2
    ;;
esac
