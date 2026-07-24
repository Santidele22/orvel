import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/20260724011000_drop_business_types_theme_key.sql",
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

test("get_dashboard_reference_catalog is redefined before dropping theme_key", async () => {
  const sql = await migrationSql();
  const beginIdx = sql.indexOf("BEGIN;");
  const dropIdx = sql.indexOf("DROP COLUMN");
  const createOrReplaceIdx = sql.indexOf("CREATE OR REPLACE FUNCTION");

  assert.ok(beginIdx >= 0, "BEGIN must be present");
  assert.ok(dropIdx >= 0, "DROP COLUMN must be present");
  assert.ok(createOrReplaceIdx >= 0, "CREATE OR REPLACE FUNCTION must be present");

  // The function must be redefined BEFORE the column drop
  assert.ok(
    createOrReplaceIdx < dropIdx,
    "get_dashboard_reference_catalog must be redefined before DROP COLUMN",
  );
});

test("redefined get_dashboard_reference_catalog excludes theme_key", async () => {
  const sql = await migrationSql();
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$/);
  assert.ok(fnMatch !== null, "RPC function body must be present");

  const fnBody = fnMatch[0];
  // The RPC must not include theme_key in business_types
  assert.doesNotMatch(
    fnBody,
    /theme_key/,
    "RPC must not reference theme_key in business_types output",
  );
});

test("drops theme_key column with IF EXISTS", async () => {
  const sql = await migrationSql();
  assert.match(sql, /DROP COLUMN IF EXISTS theme_key/i);
});

test("preserves all other columns and all 8 rows unchanged", async () => {
  const sql = await migrationSql();
  assert.doesNotMatch(sql, /DROP\s+(TABLE|VIEW|SCHEMA)/i);
  assert.doesNotMatch(sql, /DELETE FROM/i);
  // The only DROP COLUMN must reference theme_key
  const dropStatements = sql.match(/DROP\s+COLUMN\s+IF\s+EXISTS\s+\w+/gi) || [];
  assert.ok(dropStatements.length >= 1, "at least one DROP COLUMN IF EXISTS");
  for (const stmt of dropStatements) {
    assert.ok(
      /theme_key/i.test(stmt),
      `every DROP COLUMN must target theme_key, got: ${stmt}`,
    );
  }
});

test("only affects business_types table and get_dashboard_reference_catalog", async () => {
  const sql = await migrationSql();
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
