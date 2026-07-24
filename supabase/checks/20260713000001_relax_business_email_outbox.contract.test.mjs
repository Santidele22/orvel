import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/20260713000001_relax_business_email_outbox.sql",
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

test("create_public_booking removes business email INSERT for appointment_created_business", async () => {
  const sql = await migrationSql();
  // Remove comments to check only SQL code
  const noComments = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(noComments, /appointment_created_business/);
  assert.doesNotMatch(noComments, /v_business_email_rows/);
  assert.doesNotMatch(noComments, /BUSINESS_EMAIL_OUTBOX_REQUIRED/);
});

test("create_public_booking keeps customer email INSERT and dashboard_notifications INSERT", async () => {
  const sql = await migrationSql();
  assert.match(sql, /appointment_confirmation/);
  assert.match(sql, /dashboard_notifications/);
});

test("handle_booking_notifications removes business email INSERT (booking_created_business)", async () => {
  const sql = await migrationSql();
  const noComments = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(noComments, /booking_created_business/);
});

test("handle_booking_notifications keeps customer email and dashboard_notifications", async () => {
  const sql = await migrationSql();
  const funcMatch = sql.match(
    /CREATE OR REPLACE FUNCTION public\.handle_booking_notifications[\s\S]*?END;\s*\$\$/,
  );
  assert.ok(funcMatch !== null);
  const funcBody = funcMatch[0];
  assert.match(funcBody, /booking_created/);
  assert.match(funcBody, /dashboard_notifications/);
});

test("forward migration does not reintroduce EXCEPTION or ON CONFLICT DO NOTHING", async () => {
  const sql = await migrationSql();
  assert.doesNotMatch(sql, /EXCEPTION WHEN OTHERS THEN RAISE LOG/);
  assert.doesNotMatch(sql, /ON CONFLICT DO NOTHING/);
});

test("forward migration only redefines create_public_booking and handle_booking_notifications", async () => {
  const sql = await migrationSql();
  const noComments = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(noComments, /CREATE OR REPLACE FUNCTION.*_resolve_booking_business_email/);
  assert.doesNotMatch(noComments, /CREATE OR REPLACE FUNCTION.*_enqueue_booking_lifecycle_email/);
});
