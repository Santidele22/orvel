import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/20260724012000_add_business_settings_booking_knobs.sql",
  import.meta.url,
);

async function migrationSql() {
  return await readFile(migrationUrl, "utf8");
}

test("forward migration wraps in BEGIN/COMMIT and reloads schema", async () => {
  const sql = await migrationSql();
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /COMMIT;/m);
  assert.match(sql, /NOTIFY pgrst,\s*'reload schema'/m);
});

test("adds prep_buffer_minutes column with INT NOT NULL DEFAULT 0 CHECK >= 0", async () => {
  const sql = await migrationSql();
  assert.match(sql, /ADD COLUMN IF NOT EXISTS prep_buffer_minutes\s+INT\s+NOT\s+NULL\s+DEFAULT\s+0/i);
  assert.match(sql, /CHECK\s*\(\s*prep_buffer_minutes\s*>=\s*0\s*\)/i);
});

test("adds post_buffer_minutes column with INT NOT NULL DEFAULT 0 CHECK >= 0", async () => {
  const sql = await migrationSql();
  assert.match(sql, /ADD COLUMN IF NOT EXISTS post_buffer_minutes\s+INT\s+NOT\s+NULL\s+DEFAULT\s+0/i);
  assert.match(sql, /CHECK\s*\(\s*post_buffer_minutes\s*>=\s*0\s*\)/i);
});

test("adds max_advance_days column with INT NOT NULL DEFAULT 30 CHECK >= 0", async () => {
  const sql = await migrationSql();
  assert.match(sql, /ADD COLUMN IF NOT EXISTS max_advance_days\s+INT\s+NOT\s+NULL\s+DEFAULT\s+30/i);
  assert.match(sql, /CHECK\s*\(\s*max_advance_days\s*>=\s*0\s*\)/i);
});

test("adds auto_assign_professional column with BOOLEAN NOT NULL DEFAULT false", async () => {
  const sql = await migrationSql();
  assert.match(sql, /ADD COLUMN IF NOT EXISTS auto_assign_professional\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+false/i);
});

test("preserves existing min_notice_minutes column", async () => {
  const sql = await migrationSql();
  assert.doesNotMatch(sql, /DROP\s+(TABLE|VIEW|SCHEMA)/i);
  assert.doesNotMatch(sql, /DELETE FROM/i);
  // DROP COLUMN IF EXISTS is not expected in this migration
  assert.doesNotMatch(sql, /DROP COLUMN/i);
});

test("only affects business_settings table and booking helper functions", async () => {
  const sql = await migrationSql();
  const alterTableCount = (sql.match(/ALTER TABLE ONLY\s+public\.business_settings|ALTER TABLE\s+public\.business_settings/gi) || []).length;
  assert.ok(alterTableCount >= 1, "must ALTER business_settings");
  // Should not alter tables other than business_settings
  assert.doesNotMatch(sql, /ALTER TABLE\s+(?!ONLY\s+public\.business_settings|public\.business_settings)/i);
  // Should only create booking-related functions
  assert.doesNotMatch(sql, /handle_booking_notifications/i);
});
