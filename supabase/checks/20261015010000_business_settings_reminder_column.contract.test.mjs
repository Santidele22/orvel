import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/20261015010000_business_settings_reminder_column.sql",
  import.meta.url,
);

async function migrationSql() {
  return (await readFile(migrationUrl, "utf8")).toLowerCase();
}

test("migration is transactional and reloads the postgrest schema", async () => {
  const sql = await migrationSql();

  assert.match(sql, /begin;[\s\S]*commit;/);
  assert.match(sql, /notify pgrst, 'reload schema';/);
});

test("adds the reminder toggle idempotently with the expected default", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /alter table public\.business_settings\s+add column if not exists send_appointment_reminders_24h boolean not null default true;/,
  );
});

test("does not touch the columns dropped by 20260707180000", async () => {
  const sql = await migrationSql();

  assert.doesNotMatch(sql, /add column if not exists slug/);
  assert.doesNotMatch(sql, /add column if not exists business_name/);
});
