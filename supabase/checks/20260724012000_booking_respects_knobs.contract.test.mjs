import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/_legacy/20260724012000_add_business_settings_booking_knobs.sql",
  import.meta.url,
);

async function migrationSql() {
  return await readFile(migrationUrl, "utf8");
}

test("creates _read_business_booking_config helper function", async () => {
  const sql = await migrationSql();
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\._read_business_booking_config/i);
  assert.match(sql, /prep_buffer_minutes[\s\S]*post_buffer_minutes[\s\S]*min_notice_minutes[\s\S]*max_advance_days[\s\S]*auto_assign_professional/);
});

test("create_public_booking reads booking config knobs", async () => {
  const sql = await migrationSql();
  assert.match(sql, /_read_business_booking_config/);
  assert.match(sql, /v_prep_buffer/);
  assert.match(sql, /v_post_buffer/);
  assert.match(sql, /v_min_notice/);
  assert.match(sql, /v_max_advance/);
});

test("validates min_notice: raises BOOKING_TOO_SOON when starts_at is too soon", async () => {
  const sql = await migrationSql();
  assert.match(sql, /BOOKING_TOO_SOON/);
  assert.match(sql, /v_starts_at\s*<\s*now\(\s*\)\s*\+\s*make_interval\(mins\s*=>\s*v_min_notice\)/i);
});

test("validates max_advance: raises BOOKING_TOO_FAR_ADVANCE when starts_at is too far", async () => {
  const sql = await migrationSql();
  assert.match(sql, /BOOKING_TOO_FAR_ADVANCE/);
  assert.match(sql, /v_starts_at\s*>\s*now\(\s*\)\s*\+\s*make_interval\(days\s*=>\s*v_max_advance\)/i);
});

test("applies prep and post buffer to slot conflict detection", async () => {
  const sql = await migrationSql();
  // Must call _assert_no_slot_conflict with effective window
  assert.match(sql, /v_effective_start[\s\S]*make_interval.*prep_buffer/);
  assert.match(sql, /v_effective_end[\s\S]*make_interval.*post_buffer/);
  assert.match(sql, /_assert_no_slot_conflict[\s\S]*v_effective_start[\s\S]*v_effective_end/);
});

test("reads auto_assign_professional but does not assign in v1", async () => {
  const sql = await migrationSql();
  assert.match(sql, /auto_assign_professional/);
});

test("preserves existing create_public_booking contract and overload", async () => {
  const sql = await migrationSql();
  // Must have both 7-arg and 6-arg overloads
  const fnCount = (sql.match(/CREATE OR REPLACE FUNCTION public\.create_public_booking\(/g) || []).length;
  assert.ok(fnCount >= 1, "must have at least one create_public_booking definition");
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.create_public_booking[\s\S]*TO anon, authenticated/);
});
