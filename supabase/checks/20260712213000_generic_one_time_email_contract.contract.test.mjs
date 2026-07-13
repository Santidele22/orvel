import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/20260712213000_generic_one_time_email_contract.sql",
  import.meta.url,
);

async function migrationSql() {
  return (await readFile(migrationUrl, "utf8")).toLowerCase();
}

test("forward migration uses a generic lifecycle contract and preserves the original migration", async () => {
  const sql = await migrationSql();
  const original = await readFile(
    new URL("../migrations/20260710210000_one_time_trial_reminder_attempt.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /one_time_operational_email:v2/);
  assert.match(sql, /'purpose', 'one_time_operational_email'/);
  assert.doesNotMatch(sql, /masajes|booking|recipient|business/);
  assert.equal((original.match(/v_lifecycle_key constant text/g) ?? []).length, 2);
});

test("forward migration locks, validates, transforms at most one pending row, and fails closed", async () => {
  const sql = await migrationSql();

  assert.match(sql, /lock table public\.one_time_email_attempts in access exclusive mode/);
  assert.match(sql, /count\(\*\)[\s\S]*v_row_count/);
  assert.match(sql, /v_row_count > 1[\s\S]*raise exception/);
  assert.match(sql, /state <> 'reserved'[\s\S]*finalized_at is not null[\s\S]*raise exception/);
  assert.match(sql, /update public\.one_time_email_attempts[\s\S]*one_time_operational_email_contract\(\)/);
  assert.match(sql, /create or replace function public\.reserve_trial_user_activation_reminder_attempt/);
  assert.match(sql, /create or replace function public\.finalize_trial_user_activation_reminder_attempt/);
  assert.match(sql, /create trigger one_time_email_attempts_normalize_insert[\s\S]*normalize_one_time_operational_email_attempt/);
  assert.match(sql, /begin;[\s\S]*commit;/);
});

test("forward migration sets intrinsic transactional execution bounds before locking", async () => {
  const sql = await migrationSql();
  const lockTimeout = sql.indexOf("set local lock_timeout = '5s'");
  const statementTimeout = sql.indexOf("set local statement_timeout = '30s'");
  const tableLock = sql.indexOf("lock table public.one_time_email_attempts in access exclusive mode");
  assert.ok(lockTimeout >= 0 && statementTimeout >= 0 && tableLock >= 0);
  assert.ok(lockTimeout < tableLock && statementTimeout < tableLock);
});

test("generic lifecycle values come from one revoked canonical SQL helper", async () => {
  const sql = await migrationSql();
  const evidence = await readFile(new URL("./trial-user-activation-reminder-evidence.sql", import.meta.url), "utf8");
  const present = await readFile(new URL("./trial-user-activation-reminder-preflight-present.sql", import.meta.url), "utf8");

  assert.match(sql, /create function public\.one_time_operational_email_contract\(\)/);
  assert.match(sql, /revoke all on function public\.one_time_operational_email_contract\(\) from public/);
  assert.match(sql, /revoke all on function public\.one_time_operational_email_contract\(\) from service_role/);
  assert.match(sql, /revoke all on function public\.normalize_one_time_operational_email_attempt\(\) from service_role/);
  assert.equal((sql.match(/one_time_operational_email:v2/g) ?? []).length, 1);
  for (const check of [evidence, present]) {
    assert.match(check, /one_time_operational_email_contract\(\)/);
    assert.doesNotMatch(check, /one_time_operational_email:v2|purpose\s*=\s*'one_time_operational_email'/);
  }
});

test("ACL normalization closes owner defaults before generic helper creation", async () => {
  const acl = (await readFile(
    new URL("../migrations/20260712190000_normalize_legacy_reminder_function_acl.sql", import.meta.url),
    "utf8",
  )).toLowerCase();
  const generic = await migrationSql();

  assert.match(acl, /alter default privileges for role %i revoke execute on functions from public, anon, authenticated, service_role/);
  assert.match(acl, /alter default privileges for role %i in schema public revoke execute on functions from public, anon, authenticated, service_role/);
  assert.match(acl, /migration role cannot safely alter every reminder owner default/);
  assert.match(acl, /owner_oid oid primary key/);
  assert.match(acl, /union select current_user::regrole::oid/);
  assert.doesNotMatch(acl, /between 1 and 3|owner_count/);
  assert.match(generic, /generic migration requires normalized legacy function acls and defaults/);
  assert.match(generic, /generic migration final function acl matrix failed/);
  assert.match(generic, /generic migration final default acl matrix failed/);
  assert.match(generic, /generic migration relevant owner set changed before commit/);
  assert.doesNotMatch(generic, /between 1 and 3|unknown fourth relevant owner/);
  assert.ok(generic.indexOf("generic migration requires normalized legacy function acls and defaults") < generic.indexOf("create function public.one_time_operational_email_contract"));
  assert.ok(generic.indexOf("generic migration final default acl matrix failed") < generic.lastIndexOf("commit;"));
});
