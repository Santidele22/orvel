import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = new URL("../..", import.meta.url).pathname;
const migration = join(root, "supabase/migrations/20260711180000_account_confirmation_recovery.sql");
const data = mkdtempSync(join(tmpdir(), "orvel-confirmation-recovery-"));
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function sql(statement) {
  return run("psql", ["-XAt", "-v", "ON_ERROR_STOP=1", "-h", data, "postgres", "-c", statement]);
}
function asyncSql(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", ["-XAt", "-v", "ON_ERROR_STOP=1", "-h", data, "postgres", "-c", statement]);
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (error += chunk));
    child.on("close", (code) => (code === 0 ? resolve(output.trim()) : reject(new Error(error))));
  });
}
const fixture = `
create schema auth;
create role anon; create role authenticated; create role service_role;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
create table public.signup_email_confirmations (
  id uuid primary key, purpose text not null, status text not null, plan_code text not null,
  billing_period text not null default 'monthly', email_hmac text not null,
  token_hash text not null unique, protected_metadata jsonb not null default '{}'::jsonb,
  consumed_at timestamptz, expires_at timestamptz not null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.notification_email_outbox (
  id uuid primary key default gen_random_uuid(), business_id uuid, booking_id uuid,
  to_email text not null, template_key text not null, payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz, created_at timestamptz not null default now()
);
create table public.signup_request_rate_limits(id uuid default gen_random_uuid(), bucket_hash text, email_hmac text, requested_at timestamptz default now());
create function public.guard_signup_request_rate_limit(p_bucket_hash text,p_email_hmac text,p_max_requests integer default 5,p_window interval default interval '1 minute') returns boolean language plpgsql as $$ begin if (select count(*) from signup_request_rate_limits where bucket_hash=p_bucket_hash and requested_at>now()-p_window)>=p_max_requests then return true; end if; perform pg_sleep(1); insert into signup_request_rate_limits(bucket_hash,email_hmac) values(p_bucket_hash,p_email_hmac); return false; end $$;
create function public.consume_signup_email_confirmation(p_token_hash text)
returns setof uuid language sql as $$
  update public.signup_email_confirmations set consumed_at = now(), status = 'materializing'
  where token_hash = p_token_hash and status = 'pending' and consumed_at is null and expires_at > now()
  returning id
$$;
`;
function seed(id, status = "expired", expires = "now()-interval '1 minute'", created = "now()") {
  const oldToken = `old-${id}`;
  sql(`insert into signup_email_confirmations(id,purpose,status,plan_code,email_hmac,token_hash,expires_at)
    values ('${id}','free_signup','${status}','FREE','email-${id}','${oldToken}',${expires})`);
  sql(`update signup_email_confirmations set created_at=${created} where id='${id}'`);
  sql(`update signup_email_confirmations set activation_binding_hash='binding-${id}' where id='${id}'`);
  sql(`insert into notification_email_outbox(to_email,template_key,confirmation_id) values ('customer@example.invalid','signup_email_confirmation','${id}')`);
  return oldToken;
}
function recover(id, key, token = key, payload = `jsonb_build_object('confirmation_url','https://example.invalid/confirm/${token}','email_hmac','email-${id}','confirmation_id','${id}')`, recipient = "customer@example.invalid", bucket = `abuse-${id}`) {
  return `select accepted||'|'||retry_after_seconds from
    (select set_config('request.jwt.claim.role','service_role',false)) role,
    lateral recover_signup_email_confirmation('${id}','binding-${id}','${token}','${recipient}',
      ${payload},'${key}','correlation-safe','${bucket}')`;
}
before(() => {
  run("initdb", ["-D", data, "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  run("pg_ctl", ["-D", data, "-l", join(data, "postgres.log"), "-o", `-c listen_addresses='' -k ${data} -F`, "-w", "start"]);
  sql(fixture);
  sql(`insert into signup_email_confirmations(id,purpose,status,plan_code,email_hmac,token_hash,expires_at,created_at) values
    ('00000000-0000-0000-0000-000000000020','free_signup','pending','FREE','duplicate-email','valid-older',now()+interval '20 minutes',now()-interval '2 minutes'),
    ('00000000-0000-0000-0000-000000000021','free_signup','pending','FREE','duplicate-email','expired-newer',now()-interval '1 minute',now()-interval '1 minute')`);
  run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", data, "postgres", "-f", migration]);
});
after(() => {
  spawnSync("pg_ctl", ["-D", data, "-m", "immediate", "stop"]);
  rmSync(data, { recursive: true, force: true });
});
test("rotates an expired token and atomically accepts one outbox delivery", () => {
  const id = "00000000-0000-0000-0000-000000000001";
  seed(id);
  assert.match(sql(recover(id, "request-1", "new-token")), /^true\|(?:59|60)$/);
  assert.equal(sql(`select token_hash||'|'||resend_count from signup_email_confirmations where id='${id}'`), "new-token|1");
  assert.equal(sql(`select count(*) from notification_email_outbox where confirmation_id='${id}' and dedupe_key is not null`), "1");
  assert.equal(sql(`select count(*) from signup_confirmation_lifecycle_events where confirmation_id='${id}' and payload ?| array['email','token','provider']`), "0");
});
test("rejects stale tokens and allows only the replacement token to be consumed", () => {
  const id = "00000000-0000-0000-0000-000000000002";
  const oldToken = seed(id);
  sql(recover(id, "request-2", "latest-token"));
  assert.equal(sql(`select count(*) from consume_signup_email_confirmation('${oldToken}')`), "0");
  assert.equal(sql("select count(*) from consume_signup_email_confirmation('latest-token')"), "1");
});
test("persists three 60-second allowances, a temporary cooldown, and recovery after expiry", () => {
  const id = "00000000-0000-0000-0000-000000000003";
  seed(id);
  assert.match(sql(recover(id, "allowance-1")), /^true\|(?:59|60)$/);
  assert.match(sql(recover(id, "too-soon")), /^false\|(?:59|60)$/);
  for (const attempt of [2, 3]) {
    sql(`update signup_email_confirmations set resend_available_at=now()-interval '1 second' where id='${id}'`);
    assert.match(sql(recover(id, `allowance-${attempt}`)), /^true\|(?:59|60)$/);
  }
  assert.match(sql(recover(id, "temporarily-blocked")), /^false\|(?:899|900)$/);
  sql(`update signup_email_confirmations set blocked_until=now()-interval '1 second',resend_available_at=now()-interval '1 second' where id='${id}'`);
  assert.match(sql(recover(id, "new-cycle")), /^true\|(?:59|60)$/);
});
test("concurrent equivalent requests converge on one token and one outbox row", async () => {
  const id = "00000000-0000-0000-0000-000000000004";
  seed(id);
  const results = await Promise.all([asyncSql(recover(id, "same-request", "same-token")), asyncSql(recover(id, "same-request", "same-token"))]);
  assert.equal(results.length, 2);
  for (const result of results) assert.match(result, /^true\|(?:59|60)$/);
  assert.equal(sql(`select count(*) from notification_email_outbox where confirmation_id='${id}' and dedupe_key is not null`), "1");
});
test("calculates idempotent retry time after waiting for the confirmation lock", async () => {
  const id = "00000000-0000-0000-0000-000000000010";
  seed(id);
  const locker = asyncSql(`begin;
    select id from signup_email_confirmations where id='${id}' for update;
    select pg_sleep(0.3);
    update signup_email_confirmations set token_hash='locked-token',
      recovery_idempotency_key='locked-request', resend_available_at=clock_timestamp()+interval '60 seconds'
      where id='${id}';
    select pg_sleep(1.2);
    commit`);
  await delay(100);
  const recovery = asyncSql(recover(id, "locked-request", "locked-token"));
  await locker;
  assert.match(await recovery, /^true\|(?:59|60)$/);
});
test("keeps recovery RPC service-role only", () => {
  const grants = sql("select has_function_privilege('service_role','recover_signup_email_confirmation(uuid,text,text,text,jsonb,text,text,text)','execute')||'|'||has_function_privilege('anon','recover_signup_email_confirmation(uuid,text,text,text,jsonb,text,text,text)','execute')");
  assert.equal(grants, "true|false");
  assert.doesNotMatch(readFileSync(migration, "utf8"), /payload\s*\|\|\s*jsonb_build_object\([^)]*(email|token|provider)/i);
});
test("rejects mismatched binding, payload identity, and conflicting idempotency", () => {
  const id = "00000000-0000-0000-0000-000000000007";
  seed(id);
  assert.throws(() => sql(recover(id, "request-7").replace(`'binding-${id}'`, "'wrong-binding'")), /binding/i);
  assert.throws(() => sql(recover(id, "request-7").replace(`'confirmation_id','${id}'`, "'confirmation_id','00000000-0000-0000-0000-000000000099'")), /identity/i);
  sql(recover(id, "request-7", "token-7"));
  assert.throws(() => sql(recover(id, "request-7", "different-token")), /idempotency/i);
});
test("rejects a recipient different from the confirmation's persisted delivery identity", () => {
  const id = "00000000-0000-0000-0000-000000000013";
  seed(id);
  sql(`update notification_email_outbox set to_email='owner@example.invalid' where confirmation_id='${id}'`);
  assert.throws(() => sql(recover(id, "recipient-mismatch", "recipient-token", undefined, "attacker@example.invalid")), /recipient/i);
});
test("enforces one abuse ceiling across concurrent confirmations in the same bucket", async () => {
  const calls = Array.from({ length: 11 }, (_, index) => {
    const id = `00000000-0000-0000-0000-${String(30 + index).padStart(12, "0")}`;
    seed(id);
    return asyncSql(recover(id, `shared-${index}`, `shared-token-${index}`, undefined, "customer@example.invalid", "shared-bucket"));
  });
  const results = await Promise.all(calls);
  assert.equal(results.filter((result) => result.startsWith("true|")).length, 10);
  assert.equal(results.filter((result) => result === "false|900").length, 1);
});
test("rejects null payloads and missing payload identity before enqueue", () => {
  const nullPayloadId = "00000000-0000-0000-0000-000000000011";
  seed(nullPayloadId);
  assert.throws(() => sql(recover(nullPayloadId, "null-payload", "null-payload", "NULL::jsonb")), /identity/i);
  const missingIdentityId = "00000000-0000-0000-0000-000000000012";
  seed(missingIdentityId);
  const missingIdentity = recover(missingIdentityId, "missing-identity", "missing-identity",
    "jsonb_build_object('confirmation_url','https://example.invalid/confirm/missing-identity')");
  assert.throws(() => sql(missingIdentity), /identity/i);
  assert.equal(sql(`select count(*) from notification_email_outbox where confirmation_id in ('${nullPayloadId}','${missingIdentityId}') and dedupe_key is not null`), "0");
});
test("rejects missing and consumed records without mutation and documents the RPC", () => {
  const missing = "00000000-0000-0000-0000-000000000099";
  assert.equal(sql(recover(missing, "missing")), "false|60");
  const id = "00000000-0000-0000-0000-000000000008";
  seed(id); sql(`update signup_email_confirmations set consumed_at=now() where id='${id}'`);
  assert.equal(sql(recover(id, "consumed")), "false|60");
  assert.throws(() => sql(recover(id, "invalid").replace("'customer@example.invalid'", "''")), /invalid/i);
  assert.match(sql("select obj_description('recover_signup_email_confirmation(uuid,text,text,text,jsonb,text,text,text)'::regprocedure)"), /binding.*idempot/i);
});
test("duplicate cleanup preserves a valid survivor over a newer expired row", () => {
  assert.equal(sql("select id||'|'||status from signup_email_confirmations where email_hmac='duplicate-email' order by id"), "00000000-0000-0000-0000-000000000020|pending\n00000000-0000-0000-0000-000000000021|expired");
});
test("caller transaction rollback leaves token and outbox unchanged", () => {
  const id = "00000000-0000-0000-0000-000000000009";
  const old = seed(id);
  sql(`begin; ${recover(id, "rollback", "rolled-back-token")}; rollback`);
  assert.equal(sql(`select token_hash from signup_email_confirmations where id='${id}'`), old);
  assert.equal(sql(`select count(*) from notification_email_outbox where confirmation_id='${id}' and dedupe_key is not null`), "0");
});
test("recovery integrates broader abuse and durable delivery operability", () => {
  const source = readFileSync(migration, "utf8");
  assert.match(source, /guard_signup_request_rate_limit/i);
  assert.match(source, /delivery_attempts|next_attempt_at/i);
});
test("permits only one active token per email and purpose", () => {
  sql(`insert into signup_email_confirmations(id,purpose,status,plan_code,email_hmac,token_hash,expires_at)
    values ('00000000-0000-0000-0000-000000000005','free_signup','pending','FREE','unique-email','active-1',now()+interval '30 minutes')`);
  assert.throws(() => sql(`insert into signup_email_confirmations(id,purpose,status,plan_code,email_hmac,token_hash,expires_at)
    values ('00000000-0000-0000-0000-000000000006','free_signup','pending','FREE','unique-email','active-2',now()+interval '30 minutes')`), /duplicate key/);
});
