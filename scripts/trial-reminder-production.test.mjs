import assert from "node:assert/strict";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;
const operationScript = join(root, "scripts/trial-reminder-production.sh");
const source = await readFile(operationScript, "utf8");
const temporaryFunction = "send-trial-user-activation-reminder-once";
const temporarySecrets = ["TRIAL_REMINDER_RECIPIENT_EMAIL", "TRIAL_REMINDER_BUSINESS_NAME", "TRIAL_REMINDER_DASHBOARD_URL", "TRIAL_REMINDER_BOOKING_URL"];
const unrelatedFunctions = ["process-email-outbox", "account-closure"];
const unrelatedSecrets = ["MAILTRAP_API_TOKEN", "SUPABASE_URL", "ACCOUNT_CLOSURE_CRON_SECRET"];
const forbiddenIdentifierDigests = new Set([
  "879547bf0db92cc784f8f19736cd3a9463c773913aa588aeafa9deb6f4568236",
  "6d9d29fcb936f87d3ef1678cc0a52530333f514b97a52fe5aff774bfca92e342",
]);
const reviewedSupabaseCliVersion = "2.98.2";
const cleanRuntimeOverrideEnv = {
  ORVEL_ROOT: "",
  TRIAL_REMINDER_INVOKE_HELPER: "",
  TRIAL_REMINDER_SAFE_PREFLIGHT_HELPER: "",
  TRIAL_REMINDER_PREREQUISITE_HELPER: "",
  TRIAL_REMINDER_EVIDENCE_HELPER: "",
  TRIAL_REMINDER_MIGRATION_HELPER: "",
  TRIAL_REMINDER_DRY_RUN_HELPER: "",
  TRIAL_REMINDER_DURABLE_STATE_HELPER: "",
  NODE_OPTIONS: "",
  NODE_PATH: "",
};

async function harness(t, initialState = {
  functions: [temporaryFunction, ...unrelatedFunctions],
  secrets: [...temporarySecrets, ...unrelatedSecrets],
}) {
  const directory = await mkdtemp(join(tmpdir(), "trial-reminder-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const functionStatePath = join(directory, "functions.state");
  const secretStatePath = join(directory, "secrets.state");
  const logPath = join(directory, "commands.log");
  const invocationLog = join(directory, "invocations.log");
  const safePreflightLog = join(directory, "safe-preflight.log");
  const migrationStatePath = join(directory, "migration.applied");
  const secretFile = join(directory, "temporary-secrets.env");
  await mkdir(join(directory, "supabase/.temp"), { recursive: true });
  await mkdir(join(directory, "scripts"), { recursive: true });
  const sandboxOperationScript = join(directory, "scripts/trial-reminder-production.sh");
  await copyFile(operationScript, sandboxOperationScript);
  await writeFile(join(directory, "package.json"), JSON.stringify({ config: { supabaseCliVersion: reviewedSupabaseCliVersion } }));
  await writeFile(join(directory, "supabase/.temp/project-ref"), "syntheticlinkedproject\n");
  await writeFile(
    join(directory, "supabase/production-project-ref.sha256"),
    `${createHash("sha256").update("syntheticlinkedproject").digest("hex")}\n`,
  );
  await writeFile(functionStatePath, `${initialState.functions.join("\n")}\n`);
  await writeFile(secretStatePath, `${initialState.secrets.join("\n")}\n`);
  if (initialState.migrationApplied !== false) await writeFile(migrationStatePath, "applied\n");
  await writeFile(secretFile, "TRIAL_REMINDER_RECIPIENT_EMAIL=synthetic@example.invalid\nTRIAL_REMINDER_BUSINESS_NAME=Synthetic Business\nTRIAL_REMINDER_DASHBOARD_URL=https://example.invalid/settings\nTRIAL_REMINDER_BOOKING_URL=https://booking.example.invalid/opaque\n", { mode: 0o600 });
  const mock = `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >>"$MOCK_LOG"
contains() { local wanted="$1" value; shift; for value in "$@"; do [[ "$value" == "$wanted" ]] && return 0; done; return 1; }
if contains functions "$@" && contains list "$@"; then action=functions-list
elif contains secrets "$@" && contains list "$@"; then action=secrets-list
elif contains functions "$@" && contains delete "$@"; then action=functions-delete
elif contains secrets "$@" && contains unset "$@"; then action=secrets-unset
elif contains db "$@" && contains query "$@"; then action=db-query
elif contains functions "$@" && contains deploy "$@"; then action=functions-deploy
elif contains secrets "$@" && contains set "$@"; then action=secrets-set
elif contains migration "$@" && contains list "$@"; then action=migration-list
elif contains db "$@" && contains push "$@"; then action=db-push
else action=unknown; fi
[[ "\${MOCK_MODE:-}" == "hang-$action" ]] && exec sleep 10
[[ "\${MOCK_MODE:-}" == "fail-$action" ]] && exit 23
json_list() { local file="$1" first=1 value; printf '['; while IFS= read -r value; do [[ -z "$value" ]] && continue; ((first)) || printf ','; printf '{"name":"%s"}' "$value"; first=0; done <"$file"; printf ']\\n'; }
remove_targets() { local file="$1" temp="$1.tmp" value; shift; : >"$temp"; while IFS= read -r value; do [[ -z "$value" ]] && continue; contains "$value" "$@" || printf '%s\\n' "$value" >>"$temp"; done <"$file"; mv "$temp" "$file"; }
if [[ "$action" == migration-list && ! -f "$MOCK_MIGRATION_STATE" ]]; then MOCK_GATE=migration; fi
case "$action" in
  functions-list) json_list "$MOCK_FUNCTION_STATE" ;;
  secrets-list)
    if [[ -f "$MOCK_SECRET_STATE.pending" ]]; then
      count="$(<"$MOCK_SECRET_STATE.count")"; count=$((count + 1)); printf '%s' "$count" >"$MOCK_SECRET_STATE.count"
      if ((count >= 2)); then mapfile -t pending <"$MOCK_SECRET_STATE.pending"; remove_targets "$MOCK_SECRET_STATE" "\${pending[@]}"; rm "$MOCK_SECRET_STATE.pending" "$MOCK_SECRET_STATE.count"; fi
    fi
    json_list "$MOCK_SECRET_STATE" ;;
  functions-delete) remove_targets "$MOCK_FUNCTION_STATE" "${temporaryFunction}" ;;
  secrets-unset)
    if [[ "\${MOCK_MODE:-}" == delayed-unset ]]; then printf '%s\\n' "${temporarySecrets[0]}" "${temporarySecrets[1]}" "${temporarySecrets[2]}" "${temporarySecrets[3]}" >"$MOCK_SECRET_STATE.pending"; printf '0' >"$MOCK_SECRET_STATE.count"
    else remove_targets "$MOCK_SECRET_STATE" "${temporarySecrets[0]}" "${temporarySecrets[1]}" "${temporarySecrets[2]}" "${temporarySecrets[3]}"; fi ;;
  db-query) [[ "\${MOCK_GATE:-}" == sql ]] && exit 31; printf '%s\\n' "\${MOCK_EVIDENCE:-PASS}" ;;
  migration-list) if [[ "\${MOCK_GATE:-}" == migration ]]; then printf '\`20260710210000\` | \`20260710210000\` | time\\n\`20260712213000\` | \` \` | time\\n'; else printf '\`20260710210000\` | \`20260710210000\` | time\\n\`20260712213000\` | \`20260712213000\` | time\\n'; fi ;;
  db-push)
    if contains --dry-run "$@"; then
      case "\${MOCK_DRY_PLAN:-expected}" in
        expected) printf 'DRY RUN: migrations will *not* be pushed to the database.\nWould push these migrations:\n • 20260712213000_generic_one_time_email_contract.sql\nFinished supabase db push.\n' ;;
        empty) printf 'DRY RUN: migrations will *not* be pushed to the database.\nWould push these migrations:\n' ;;
        extra) printf 'Would push these migrations:\n • 20260712213000_generic_one_time_email_contract.sql\n • 20260712214000_extra.sql\n' ;;
        malformed) printf 'unexpected output\n' ;;
      esac
    else touch "$MOCK_MIGRATION_STATE"; fi ;;
  functions-deploy) [[ "\${MOCK_GATE:-}" == function ]] || printf '%s\\n' "${temporaryFunction}" >>"$MOCK_FUNCTION_STATE" ;;
  secrets-set) if [[ "\${MOCK_GATE:-}" == missing-secret ]]; then printf '%s\\n' "${temporarySecrets[0]}" >>"$MOCK_SECRET_STATE"; else printf '%s\\n' "${temporarySecrets[0]}" "${temporarySecrets[1]}" "${temporarySecrets[2]}" "${temporarySecrets[3]}" >>"$MOCK_SECRET_STATE"; fi ;;
  *) exit 24 ;;
esac
`;
  const mockNpx = join(directory, "npx");
  await writeFile(mockNpx, mock);
  await chmod(mockNpx, 0o700);
  const mockTimeout = join(directory, "timeout");
  await writeFile(mockTimeout, `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${MOCK_USE_REAL_TIMEOUT:-0}" == "1" ]]; then exec /usr/bin/timeout "$@"; fi
[[ "\${1:-}" == "--foreground" ]] && shift
[[ "\${1:-}" =~ ^[0-9.]+s$ ]] && shift
exec "$@"
`);
  await chmod(mockTimeout, 0o700);
  const mockNode = join(directory, "node");
  await writeFile(mockNode, `#!/usr/bin/env bash
set -euo pipefail
helper="\${1##*/}"
case "$helper" in
  trial-reminder-prerequisites.mjs|prerequisite-helper.mjs) exit "\${MOCK_PREREQ_STATUS:-0}" ;;
  trial-reminder-evidence.mjs)
    if [[ "\${3:-}" == init ]]; then printf '{"operation_id":"%s","started_at":"2026-07-11T12:00:00.000Z"}\\n' "$(</proc/sys/kernel/random/uuid)" >"$2"; chmod 600 "$2"; fi
    exit 0 ;;
  trial-reminder-migration-list.mjs)
    input="$(cat)"; state="\${3:-applied}"
    [[ "$state" == pending && "$input" == *'\`20260712213000\` | \` \`'* ]] && exit 0
    [[ "$state" == applied && "$input" == *'\`20260712213000\` | \`20260712213000\`'* ]] && exit 0
    exit 1 ;;
  trial-reminder-dry-run.mjs)
    input="$(cat)"; count="$(grep -o '20260712213000_generic_one_time_email_contract.sql' <<<"$input" | wc -l)"
    [[ "$count" -eq 1 && "$input" == *'Would push these migrations:'* && "$input" != *'20260712214000'* ]] && exit 0
    exit 1 ;;
  trial-reminder-secret-file.mjs)
    mapfile -t lines <"$2"; [[ "\${#lines[@]}" -eq 4 ]] || exit 1; recipient=0; identity=0
    for line in "\${lines[@]}"; do
      [[ "$line" =~ ^TRIAL_REMINDER_RECIPIENT_EMAIL=[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$ ]] && recipient=$((recipient + 1)) && continue
      [[ "$line" == TRIAL_REMINDER_BUSINESS_NAME=* ]] && identity=$((identity + 1)) && continue
      [[ "$line" == TRIAL_REMINDER_DASHBOARD_URL=https://* ]] && continue
      [[ "$line" == TRIAL_REMINDER_BOOKING_URL=https://* ]] && continue
      exit 1
    done
    [[ "$recipient" -eq 1 && "$identity" -eq 1 ]] || exit 1; exit 0 ;;
  trial-reminder-safe-preflight.mjs|safe-helper.mjs)
    printf 'safe-preflight\\n' >>"$MOCK_SAFE_PREFLIGHT_LOG"; [[ "\${MOCK_SAFE_STATUS:-405}" == 405 ]] || exit 1; printf 'safe_preflight_status=405\\n'; exit 0 ;;
esac
if [[ "\${1:-}" == "-e" ]]; then
  source_code="$2"; shift 2
  if [[ "$source_code" == *'fs.statSync'* ]]; then [[ "$(stat -c %a "$1")" == "600" ]] && exit 0 || exit 1; fi
  json="$1"; target="\${2:-}"
  if [[ "$source_code" == *'const wanted=new Set'* ]]; then
    [[ "$json" == *'"name":"${temporarySecrets[0]}"'* && "$json" == *'"name":"${temporarySecrets[1]}"'* && "$json" != *'"name":"TRIAL_REMINDER_EXTRA"'* ]] || exit 1
    [[ "$json" == *'"name":"${temporarySecrets[2]}"'* && "$json" == *'"name":"${temporarySecrets[3]}"'* ]] || exit 1
    printf '4\\n'; exit 0
  fi
  [[ "$json" == *"\\\"name\\\":\\\"$target\\\""* ]] && printf 'present\\n' || printf 'absent\\n'
  exit 0
fi
exec "${process.execPath}" "$@"
`);
  await chmod(mockNode, 0o700);
  const invokeHelper = join(directory, "invoke-helper.mjs");
  await writeFile(invokeHelper, `import { appendFileSync } from "node:fs"; import { execFileSync } from "node:child_process";
const core = execFileSync("bash", ["-c", "ulimit -c"], { encoding: "utf8" }).trim();
appendFileSync(process.env.MOCK_INVOCATION_LOG, "invoke core=" + core + "\\n");
const status = Number(process.env.MOCK_INVOKE_STATUS || 0);
if (status === 0) console.log("invocation_http_status=200");
process.exit(status);\n`);
  const safeHelper = join(directory, "safe-helper.mjs");
  await writeFile(safeHelper, `import { appendFileSync } from "node:fs";
appendFileSync(process.env.MOCK_SAFE_PREFLIGHT_LOG, "safe-preflight\\n");
if (Number(process.env.MOCK_SAFE_STATUS || 405) !== 405) process.exit(1);
console.log("safe_preflight_status=405");\n`);
  const prerequisiteHelper = join(directory, "prerequisite-helper.mjs");
  await writeFile(prerequisiteHelper, `process.exit(Number(process.env.MOCK_PREREQ_STATUS || 0));\n`);
  return { directory, operationScript: sandboxOperationScript, functionStatePath, secretStatePath, migrationStatePath, logPath, invocationLog, invokeHelper, safeHelper, safePreflightLog, prerequisiteHelper, secretFile };
}

function run(stage, fixture, mode = "success") {
  const options = {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      ...cleanRuntimeOverrideEnv,
      PATH: `${fixture.directory}:${process.env.PATH}`,
      CLI_TIMEOUT_SECONDS: mode.startsWith("hang-") ? "0.2" : "60",
      MOCK_USE_REAL_TIMEOUT: mode.startsWith("hang-") ? "1" : "0",
      CLEANUP_VERIFY_DELAY_SECONDS: "0.01",
      MOCK_MODE: mode,
      MOCK_FUNCTION_STATE: fixture.functionStatePath,
      MOCK_SECRET_STATE: fixture.secretStatePath,
      MOCK_MIGRATION_STATE: fixture.migrationStatePath,
      MOCK_LOG: fixture.logPath,
      MOCK_INVOCATION_LOG: fixture.invocationLog,
      MOCK_SAFE_PREFLIGHT_LOG: fixture.safePreflightLog,
      MOCK_EVIDENCE: "sent",
    },
  };
  return spawnSync("bash", [fixture.operationScript, stage], options);
}

test("cleanup is repeatable and touches only temporary resources", async (t) => {
  const fixture = await harness(t);
  assertEqualsZero(run("cleanup", fixture));
  assertEqualsZero(run("cleanup", fixture));
  const state = await readMockState(fixture);
  assert.deepEqual(state, { functions: unrelatedFunctions, secrets: unrelatedSecrets });
  const log = await readFile(fixture.logPath, "utf8");
  assert.match(log, new RegExp(`functions delete ${temporaryFunction}`));
  assert.match(log, /secrets unset TRIAL_REMINDER_RECIPIENT_EMAIL TRIAL_REMINDER_BUSINESS_NAME TRIAL_REMINDER_DASHBOARD_URL TRIAL_REMINDER_BOOKING_URL/);
  assert.doesNotMatch(log, /MAILTRAP/);
  assertNoForbiddenIdentifiers(log);
});

test("recover is repeatable and preserves unrelated resources", async (t) => {
  const fixture = await harness(t);
  assertEqualsZero(run("recover", fixture));
  assertEqualsZero(run("recover", fixture));
  assert.deepEqual(await readMockState(fixture), {
    functions: unrelatedFunctions,
    secrets: unrelatedSecrets,
  });
});

test("cleanup waits for eventual secret absence before returning", async (t) => {
  const fixture = await harness(t);
  assertEqualsZero(run("cleanup", fixture, "delayed-unset"));
  assert.deepEqual(await readMockState(fixture), { functions: unrelatedFunctions, secrets: unrelatedSecrets });
});

test("cleanup and verification fail deterministically on list timeouts or errors", async (t) => {
  for (const mode of ["hang-functions-list", "fail-functions-list", "hang-secrets-list", "fail-secrets-list"]) {
    const fixture = await harness(t, { functions: unrelatedFunctions, secrets: unrelatedSecrets });
    const result = run(mode.includes("secrets") ? "verify-clean" : "cleanup", fixture, mode);
    assert.equal(result.status, mode.startsWith("hang-") ? 124 : 23, mode);
  }
});

test("cleanup fails on delete/unset timeout or error and succeeds when rerun", async (t) => {
  for (const action of ["functions-delete", "secrets-unset"]) {
    for (const outcome of ["hang", "fail"]) {
      const fixture = await harness(t);
      const failed = run("cleanup", fixture, `${outcome}-${action}`);
      assert.equal(failed.status, outcome === "hang" ? 124 : 23, `${outcome}-${action}`);
      assertEqualsZero(run("cleanup", fixture));
    }
  }
});

test("all Supabase cleanup/list commands are timeout wrapped and scope is fixed", () => {
  assert.match(source, /CLI_TIMEOUT_SECONDS/);
  assertNoForbiddenIdentifiers(source);
  assert.doesNotMatch(source, /MAILTRAP_.*unset/);
  for (const fragment of ["functions list", "secrets list", "functions delete", "secrets unset"]) {
    assert.match(source, new RegExp(`run_cli ${fragment}`));
  }
});

test("production script pins every Supabase CLI invocation to the reviewed version", () => {
  assert.doesNotMatch(source, /supabase@latest/);
  assert.match(source, /config\.supabaseCliVersion/);
  assert.match(source, /supabase@\$supabase_cli_version/);
});

test("production rejects root and checked-in helper overrides", () => {
  for (const name of ["ORVEL_ROOT", "TRIAL_REMINDER_SAFE_PREFLIGHT_HELPER", "TRIAL_REMINDER_PREREQUISITE_HELPER", "TRIAL_REMINDER_EVIDENCE_HELPER", "TRIAL_REMINDER_MIGRATION_HELPER", "TRIAL_REMINDER_DRY_RUN_HELPER", "TRIAL_REMINDER_DURABLE_STATE_HELPER"]) {
    assert.match(source, new RegExp(name));
  }
  assert.doesNotMatch(source, /root=\"\$\{ORVEL_ROOT/);
  assert.doesNotMatch(source, /HELPER:-/);
  assert.equal((source.match(/NODE_OPTIONS/g) ?? []).length, 1);
  assert.equal((source.match(/NODE_PATH/g) ?? []).length, 1);
});

test("production and runbook require exactly four temporary secrets", async () => {
  const runbook = await readFile(join(root, "docs/runbooks/trial-user-activation-reminder.md"), "utf8");
  assert.match(source, /temporary_secrets=\([^)]*RECIPIENT_EMAIL[^)]*BUSINESS_NAME[^)]*DASHBOARD_URL[^)]*BOOKING_URL[^)]*\)/s);
  assert.match(source, /\[\[ "\$secret_count" -eq 4 \]\]/);
  assert.match(runbook, /exactly four assignment lines/);
  assert.match(runbook, /exactly four temporary secrets/);
  assert.doesNotMatch(runbook, /exactly two temporary secrets/);
});

test("runbook documents intrinsic migration timeout rollback, retry, and verification", async () => {
  const runbook = await readFile(join(root, "docs/runbooks/trial-user-activation-reminder.md"), "utf8");
  assert.match(runbook, /lock_timeout.*5 seconds/is);
  assert.match(runbook, /statement_timeout.*30 seconds/is);
  assert.doesNotMatch(runbook, /db push --include-all/);
  assert.match(runbook, /transaction rolls back.*no partial schema or data state/is);
  assert.match(runbook, /pending history/);
  assert.match(runbook, /forward-migrate/);
});

test("forward-migrate enforces history, legacy gate, exact dry-run, push, alignment, and present gate order", async (t) => {
  const fixture = await harness(t, { functions: unrelatedFunctions, secrets: unrelatedSecrets, migrationApplied: false });
  assertEqualsZero(runStage(["forward-migrate"], fixture));

  const log = await readFile(fixture.logPath, "utf8");
  const firstHistory = log.indexOf("migration list --linked");
  const intermediate = log.indexOf("trial-user-activation-reminder-preflight-legacy-applied.sql");
  const dryRun = log.indexOf("db push --linked --dry-run --yes");
  const push = log.indexOf("db push --linked --yes");
  const secondHistory = log.indexOf("migration list --linked", firstHistory + 1);
  const present = log.indexOf("trial-user-activation-reminder-preflight-present.sql");
  assert.ok(firstHistory >= 0 && firstHistory < intermediate);
  assert.ok(intermediate < dryRun && dryRun < push);
  assert.ok(push < secondHistory && secondHistory < present);
  assert.doesNotMatch(log, /--include-all|functions deploy|secrets set/);
  await assert.rejects(() => readFile(fixture.invocationLog));
});

test("invalid dry-run plans fail before push and present preflight", async (t) => {
  for (const plan of ["empty", "extra", "malformed"]) {
    const fixture = await harness(t, { functions: unrelatedFunctions, secrets: unrelatedSecrets, migrationApplied: false });
    const result = runStage(["forward-migrate"], fixture, { MOCK_DRY_PLAN: plan });
    assert.notEqual(result.status, 0, plan);
    const log = await readFile(fixture.logPath, "utf8");
    assert.equal((log.match(/db push --linked --yes/g) ?? []).length, 0, plan);
    assert.doesNotMatch(log, /preflight-present\.sql/);
  }
});

test("manual preflight and direct mutation stages are unavailable; diagnose remains read-only", async (t) => {
  const fixture = await harness(t, { functions: unrelatedFunctions, secrets: unrelatedSecrets });
  assertEqualsZero(runStage(["diagnose", "present"], fixture));
  for (const args of [["preflight", "present"], ["push"], ["migrate"]]) {
    assert.equal(runStage(args, fixture).status, 2);
  }
  const log = await readFile(fixture.logPath, "utf8");
  assert.doesNotMatch(log, /db push|functions deploy|secrets set/);
});

test("record-terminal derives state from checked-in evidence query instead of caller input", () => {
  assert.match(source, /record-terminal\)[\s\S]*trial-user-activation-reminder-evidence\.sql/);
  assert.doesNotMatch(source, /record-terminal\)[\s\S]{0,120}\$\{2:-\}/);
});

test("project ref comes from the local link and preflight uses linked file queries", async (t) => {
  const fixture = await harness(t, { functions: unrelatedFunctions, secrets: unrelatedSecrets });
  assertEqualsZero(run("verify-clean", fixture));
  const log = await readFile(fixture.logPath, "utf8");
  assert.match(log, /--project-ref syntheticlinkedproject/);
  assert.doesNotMatch(source, /SUPABASE_PROJECT_REF:\?/);
  assert.match(source, /db query --linked --file/);
  assert.match(source, /expected_migration="20260712213000"/);
});

test("project identity mismatch fails before any CLI command", async (t) => {
  const fixture = await harness(t, { functions: unrelatedFunctions, secrets: unrelatedSecrets });
  await writeFile(
    join(fixture.directory, "supabase/production-project-ref.sha256"),
    `${createHash("sha256").update("differentproductionref").digest("hex")}\n`,
  );
  const result = run("verify-clean", fixture);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /syntheticlinkedproject|differentproductionref/);
  await assert.rejects(() => readFile(fixture.logPath));
});

test("invoke gates fail before API-key helper and safe preflight runs exactly once", async (t) => {
  const fixture = await harness(t, { functions: unrelatedFunctions, secrets: [...temporarySecrets, ...unrelatedSecrets] });
  const result = run("invoke-once", fixture);
  assert.notEqual(result.status, 0);
  await assert.rejects(() => readFile(fixture.invocationLog));
  await assert.rejects(() => readFile(fixture.safePreflightLog));
});

test("host prerequisite failure occurs before CLI access", async (t) => {
  const fixture = await harness(t);
  const result = spawnSync("bash", [fixture.operationScript, "verify-clean"], {
    cwd: root, encoding: "utf8",
    env: {
      ...process.env, ...cleanRuntimeOverrideEnv, PATH: `${fixture.directory}:${process.env.PATH}`, MOCK_PREREQ_STATUS: "19",
      MOCK_LOG: fixture.logPath, MOCK_FUNCTION_STATE: fixture.functionStatePath, MOCK_SECRET_STATE: fixture.secretStatePath, MOCK_MIGRATION_STATE: fixture.migrationStatePath,
    },
  });
  assert.equal(result.status, 19);
  await assert.rejects(() => readFile(fixture.logPath));
});

test("shell disables core dumps before invoking helper", () => {
  assert.match(source, /ulimit -c 0/);
});

test("direct invoke-once stage is unavailable", async (t) => {
  const fixture = await harness(t);
  const result = run("invoke-once", fixture);
  assert.equal(result.status, 2);
  await assert.rejects(() => readFile(fixture.invocationLog));
});

test("every immediate gate failure prevents invocation and cleans staged resources", async (t) => {
  for (const gate of ["migration", "sql", "function", "missing-secret", "safe"]) {
    const fixture = await harness(t, { functions: [...unrelatedFunctions], secrets: [...unrelatedSecrets] });
    const result = runStage(["prepare-and-invoke", fixture.secretFile], fixture, {
      MOCK_GATE: gate,
      MOCK_SAFE_STATUS: gate === "safe" ? "401" : "405",
    });
    assert.notEqual(result.status, 0, gate);
    await assert.rejects(() => readFile(fixture.invocationLog));
    if (gate === "safe") assert.equal(await readFile(fixture.safePreflightLog, "utf8"), "safe-preflight\n");
    else await assert.rejects(() => readFile(fixture.safePreflightLog));
    assert.deepEqual(await readMockState(fixture), {
      functions: unrelatedFunctions,
      secrets: unrelatedSecrets,
    });
  }
});

test("invalid secret file fails before secret or deploy mutation", async (t) => {
  const fixture = await harness(t, { functions: [...unrelatedFunctions], secrets: [...unrelatedSecrets] });
  await writeFile(fixture.secretFile, "TRIAL_REMINDER_RECIPIENT_EMAIL=synthetic@example.invalid\nTRIAL_REMINDER_BUSINESS_NAME=Synthetic Business\nTRIAL_REMINDER_DASHBOARD_URL=https://example.invalid/settings\nTRIAL_REMINDER_BOOKING_URL=https://booking.example.invalid/opaque\nTRIAL_REMINDER_EXTRA=value\n", { mode: 0o600 });
  const result = runStage(["prepare-and-invoke", fixture.secretFile], fixture);
  assert.notEqual(result.status, 0);
  const log = await readFile(fixture.logPath, "utf8");
  assert.doesNotMatch(log, /secrets set|functions deploy/);
  assert.deepEqual(await readMockState(fixture), { functions: unrelatedFunctions, secrets: unrelatedSecrets });
});

test("production invocation helper and module injection overrides are rejected", async (t) => {
  for (const extra of [
    { TRIAL_REMINDER_INVOKE_HELPER: "/tmp/bypass.mjs" },
    { NODE_OPTIONS: "--require=/tmp/bypass.cjs" },
    { NODE_PATH: "/tmp/modules" },
  ]) {
    const fixture = await harness(t, { functions: unrelatedFunctions, secrets: unrelatedSecrets });
    const result = runStage(["prepare-and-invoke", fixture.secretFile], fixture, extra);
    assert.notEqual(result.status, 0);
    await assert.rejects(() => readFile(fixture.logPath));
  }
});

test("new prepare run drops stale terminal evidence before a gate failure", async (t) => {
  const fixture = await harness(t, { functions: [...unrelatedFunctions], secrets: [...unrelatedSecrets] });
  const evidencePath = join(fixture.directory, "supabase/.temp/trial-reminder-production-evidence.json");
  await writeFile(evidencePath, JSON.stringify({ invocation_http_status: 200, durable_state: "sent" }));
  const result = runStage(["prepare-and-invoke", fixture.secretFile], fixture, { MOCK_GATE: "migration" });
  assert.notEqual(result.status, 0);
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  assert.equal(typeof evidence.operation_id, "string");
  assert.equal(typeof evidence.started_at, "string");
  assert.equal(Object.hasOwn(evidence, "invocation_http_status"), false);
  assert.equal(Object.hasOwn(evidence, "durable_state"), false);
});

function runStage(args, fixture, extra = {}) {
  const inheritedEnv = { ...process.env };
  for (const name of [
    "ORVEL_ROOT",
    "TRIAL_REMINDER_INVOKE_HELPER",
    "TRIAL_REMINDER_SAFE_PREFLIGHT_HELPER",
    "TRIAL_REMINDER_PREREQUISITE_HELPER",
    "TRIAL_REMINDER_EVIDENCE_HELPER",
    "TRIAL_REMINDER_MIGRATION_HELPER",
    "TRIAL_REMINDER_DRY_RUN_HELPER",
    "TRIAL_REMINDER_DURABLE_STATE_HELPER",
    "NODE_OPTIONS",
    "NODE_PATH",
  ]) delete inheritedEnv[name];

  return spawnSync("bash", [fixture.operationScript, ...args], {
    cwd: root, encoding: "utf8",
    env: {
      ...inheritedEnv, PATH: `${fixture.directory}:${process.env.PATH}`,
      ...cleanRuntimeOverrideEnv,
      CLI_TIMEOUT_SECONDS: "60", MOCK_USE_REAL_TIMEOUT: "0", MOCK_MODE: "success", MOCK_FUNCTION_STATE: fixture.functionStatePath, MOCK_SECRET_STATE: fixture.secretStatePath, MOCK_MIGRATION_STATE: fixture.migrationStatePath, MOCK_LOG: fixture.logPath,
      CLEANUP_VERIFY_DELAY_SECONDS: "0.01",
      MOCK_INVOCATION_LOG: fixture.invocationLog,
      MOCK_SAFE_PREFLIGHT_LOG: fixture.safePreflightLog,
      ...extra,
    },
  });
}

function assertEqualsZero(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function assertNoForbiddenIdentifiers(content) {
  for (const token of content.match(/[a-z0-9]+/gi) ?? []) {
    const digest = createHash("sha256").update(token.toLowerCase()).digest("hex");
    assert.equal(forbiddenIdentifierDigests.has(digest), false, "forbidden identifier found");
  }
}

async function readMockState(fixture) {
  const readLines = async (path) => (await readFile(path, "utf8")).split("\n").filter(Boolean);
  return { functions: await readLines(fixture.functionStatePath), secrets: await readLines(fixture.secretStatePath) };
}
