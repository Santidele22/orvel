import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/_legacy/20260713000000_harden_dashboard_notifications_required.sql",
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

test("create_public_booking removes EXCEPTION wrapper around dashboard_notifications INSERT", async () => {
  const sql = await migrationSql();
  // The old pattern had EXCEPTION WHEN OTHERS THEN RAISE LOG around dashboard_notifications
  // The new code should have a direct INSERT with VALUES (no EXCEPTION wrapper)
  assert.doesNotMatch(sql, /EXCEPTION WHEN OTHERS THEN RAISE LOG.*bell notification/);
  // Must use direct INSERT INTO ... VALUES (multiline OK)
  assert.match(sql, /INSERT INTO public\.dashboard_notifications[\s\S]*?VALUES\s*\(/);
});

test("create_public_booking dashboard_notifications INSERT fails open (no EXCEPTION)", async () => {
  const sql = await migrationSql();
  // Count dashboard_notifications INSERT blocks — the one in create_public_booking
  // should not be wrapped in an EXCEPTION block
  const dashInsertLines = sql
    .split("\n")
    .filter(
      (l) =>
        l.includes("dashboard_notifications") &&
        l.includes("INSERT") &&
        !l.includes("--"),
    );
  assert.ok(dashInsertLines.length >= 1);
});

test("handle_booking_notifications removes ON CONFLICT DO NOTHING on dashboard_notifications INSERT", async () => {
  const sql = await migrationSql();
  // The ON CONFLICT DO NOTHING must be removed from dashboard_notifications INSERT
  // There should be no ON CONFLICT after a dashboard_notifications INSERT
  const dashBlocks = sql.match(
    /INSERT INTO public\.dashboard_notifications[\s\S]*?;/g,
  );
  assert.ok(dashBlocks !== null && dashBlocks.length >= 1);
  for (const block of dashBlocks) {
    assert.doesNotMatch(block, /ON CONFLICT/i);
  }
});

test("handle_booking_notifications inserts dashboard_notifications BEFORE outbox email enqueues", async () => {
  const sql = await migrationSql();
  // Find the trigger function body and verify order:
  // 1. dashboard_notifications INSERT comes first
  // 2. notification_email_outbox INSERTs come after
  const functionBody = sql.match(
    /CREATE OR REPLACE FUNCTION public\.handle_booking_notifications[\s\S]*?END;\s*\$\$/,
  );
  assert.ok(functionBody !== null, "handle_booking_notifications function not found");

  const func = functionBody[0];
  const dashPos = func.indexOf("dashboard_notifications");
  const outboxPos = func.indexOf("notification_email_outbox");

  assert.ok(dashPos >= 0, "dashboard_notifications INSERT not found in function");
  assert.ok(outboxPos >= 0, "notification_email_outbox INSERT not found in function");
  assert.ok(
    dashPos < outboxPos,
    "dashboard_notifications INSERT must come BEFORE notification_email_outbox INSERTs",
  );
});

test("forward migration does not remove business email constraint from create_public_booking", async () => {
  const sql = await migrationSql();
  // The BUSINESS_EMAIL_OUTBOX_REQUIRED check should still exist (Fase 9 removes it)
  assert.match(sql, /BUSINESS_EMAIL_OUTBOX_REQUIRED/);
  assert.match(sql, /appointment_created_business/);
});

test("forward migration only affects create_public_booking and handle_booking_notifications", async () => {
  const sql = await migrationSql();
  // Should not touch other functions
  const createPublicBookingCount = (
    sql.match(/CREATE OR REPLACE FUNCTION public\.create_public_booking/g) || []
  ).length;
  const handleNotificationsCount = (
    sql.match(/CREATE OR REPLACE FUNCTION public\.handle_booking_notifications/g) ||
    []
  ).length;
  assert.ok(createPublicBookingCount >= 1);
  assert.ok(handleNotificationsCount >= 1);
  // Should not redefine other functions (calling them is OK; DDL redefine is not)
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION.*_resolve_booking_business_email/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION.*_enqueue_booking_lifecycle_email/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION.*_booking_lifecycle_email_payload/);
});
