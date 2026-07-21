import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/20260710210000_one_time_trial_reminder_attempt.sql",
  import.meta.url,
);

async function migrationSql() {
  return (await readFile(migrationUrl, "utf8")).toLowerCase();
}

test("reservation is fixed, atomic, and terminal", async () => {
  const sql = await migrationSql();

  assert.match(sql, /lifecycle_key text primary key/);
  assert.match(sql, /v_lifecycle_key constant text/);
  assert.match(sql, /insert into public\.one_time_email_attempts/);
  assert.match(sql, /on conflict \(lifecycle_key\) do nothing/);
  assert.match(sql, /return 'already_consumed'/);
  assert.doesNotMatch(sql, /on conflict[\s\S]*do update/);
});

test("finalization is monotonic and accepts only terminal outcomes", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /p_state is null[\s\S]*p_state not in \('sent', 'rejected', 'ambiguous'\)/,
  );
  assert.match(sql, /where lifecycle_key = v_lifecycle_key[\s\S]*and state = 'reserved'/);
  assert.match(sql, /finalized_at = clock_timestamp\(\)/);
  assert.match(sql, /prevent_one_time_email_attempt_mutation/);
  assert.match(sql, /prevent_one_time_email_attempt_delete/);
});

test("direct table access is denied while service role can execute only RPCs", async () => {
  const sql = await migrationSql();

  for (const role of ["public", "anon", "authenticated", "service_role"]) {
    assert.match(
      sql,
      new RegExp(`revoke all on table public\\.one_time_email_attempts from ${role}`),
    );
  }

  assert.match(
    sql,
    /grant execute on function public\.reserve_trial_user_activation_reminder_attempt\(\) to service_role/,
  );
  assert.match(
    sql,
    /grant execute on function public\.finalize_trial_user_activation_reminder_attempt\(text\) to service_role/,
  );
  assert.doesNotMatch(sql, /notification_email_outbox[\s\S]*(insert|update|delete)/);
});
