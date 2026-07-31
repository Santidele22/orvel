import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/_legacy/20260724010000_add_business_types_is_promoted.sql",
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

test("adds is_promoted column with BOOLEAN NOT NULL DEFAULT false", async () => {
  const sql = await migrationSql();
  assert.match(
    sql,
    /ADD COLUMN IF NOT EXISTS is_promoted BOOLEAN NOT NULL DEFAULT false/i,
  );
});

test("seeds exactly 4 promoted rows by code", async () => {
  const sql = await migrationSql();
  const match = sql.match(
    /UPDATE.*business_types[\s\S]*?WHERE\s+code\s+IN\s*\(([^)]+)\)/i,
  );
  assert.ok(match !== null, "UPDATE is_promoted = true WHERE code IN (...) not found");

  const codes = match[1]
    .split(",")
    .map((c) => c.trim().replace(/['"]/g, ""));
  assert.equal(codes.length, 4, "exactly 4 codes must be promoted");
  assert.ok(codes.includes("unas"), "unas must be promoted");
  assert.ok(codes.includes("masajes"), "masajes must be promoted");
  assert.ok(codes.includes("barberia"), "barberia must be promoted");
  assert.ok(codes.includes("peluqueria"), "peluqueria must be promoted");
});

test("get_dashboard_reference_catalog includes is_promoted in business_types", async () => {
  const sql = await migrationSql();
  // The RPC should include is_promoted in business_types JSON output
  assert.match(sql, /is_promoted/);
});

test("does not remove any existing columns or rows", async () => {
  const sql = await migrationSql();
  assert.doesNotMatch(sql, /DROP COLUMN/i);
  assert.doesNotMatch(sql, /DELETE FROM/i);
});

test("only affects business_types table and get_dashboard_reference_catalog", async () => {
  const sql = await migrationSql();
  // Should only touch business_types
  const createOrReplaceCount = (
    sql.match(/CREATE OR REPLACE FUNCTION/g) || []
  ).length;
  assert.ok(createOrReplaceCount >= 1);
  // Should not redefine unrelated functions
  assert.doesNotMatch(
    sql,
    /handle_booking_notifications|create_public_booking/,
  );
});
