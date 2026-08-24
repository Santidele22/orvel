import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const migrationsDir = new URL("../migrations/", import.meta.url);

async function reminderMigrationSql() {
  const entries = await readdir(migrationsDir);
  const fileName = entries
    .filter((name) => name.endsWith(".sql") && name.includes("signup_confirm_reminder"))
    .sort()
    .at(-1);
  assert.ok(fileName, "expected a *_signup_confirm_reminder.sql migration");
  return readFile(new URL(fileName, migrationsDir), "utf8");
}

test("reminder RPC enqueues signup_email_confirmation_reminder after 48h when email_confirmed_at is null", async () => {
  const sql = await reminderMigrationSql();

  assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.enqueue_signup_email_verification_actions\s*\(\s*\)/i);
  assert.match(sql, /email_confirmed_at\s+IS\s+NULL/i);
  assert.match(sql, /dashboard_ready_at\s*<=\s*now\(\)\s*-\s*interval\s+'48 hours'/i);
  assert.match(sql, /template_key\s*,[\s\S]*'signup_email_confirmation_reminder'|template_key\s*=\s*'signup_email_confirmation_reminder'/i);
  assert.match(sql, /lifecycle_event_key[\s\S]*'signup-confirm-reminder:'\s*\|\|\s*/i);
});

test("reminder RPC skips confirmed operators and keeps the lifecycle key unique", async () => {
  const sql = await reminderMigrationSql();

  assert.match(sql, /email_confirmed_at\s+IS\s+NULL/i);
  assert.doesNotMatch(
    sql,
    /email_confirmed_at\s+IS\s+NOT\s+NULL[\s\S]{0,160}signup_email_confirmation_reminder/i,
  );
  assert.match(
    sql,
    /ON\s+CONFLICT\s*\(\s*lifecycle_event_key\s*\)[\s\S]*DO\s+NOTHING/i,
  );
  assert.match(sql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.enqueue_signup_email_verification_actions\(\)\s+TO\s+service_role/i);
  assert.match(sql, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.enqueue_signup_email_verification_actions\(\)\s+FROM\s+PUBLIC/i);
});
