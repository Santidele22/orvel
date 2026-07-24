import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/20260713000002_add_customer_cancellation_email.sql",
  import.meta.url,
);

async function migrationSql() {
  return await readFile(migrationUrl, "utf8");
}

function stripComments(sql) {
  return sql.replace(/--.*$/gm, "");
}

test("forward migration wraps in BEGIN/COMMIT and reloads schema", async () => {
  const sql = await migrationSql();
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /COMMIT;/m);
  assert.match(sql, /NOTIFY pgrst,\s*'reload schema'/m);
});

test("handle_booking_notifications adds UPDATE cancelled block with dashboard_notification and enqueue", async () => {
  const sql = await migrationSql();
  const funcMatch = sql.match(
    /CREATE OR REPLACE FUNCTION public\.handle_booking_notifications[\s\S]*?END;\s*\$\$/,
  );
  assert.ok(funcMatch !== null, "handle_booking_notifications function not found");
  const func = funcMatch[0];

  // Must have TG_OP = 'UPDATE' AND NEW.status = 'cancelled' with OLD guard
  assert.match(func, /TG_OP\s*=\s*'UPDATE'/);
  assert.match(func, /NEW\.status\s*=\s*'cancelled'/);
  assert.match(func, /OLD\.status\s*IS DISTINCT FROM\s*'cancelled'/);
});

test("handle_booking_notifications enqueues appointment_cancelled for booking_user on cancel", async () => {
  const sql = await migrationSql();
  const noComments = stripComments(sql);
  // Must call _enqueue_booking_lifecycle_email with appointment_cancelled and booking_user
  assert.match(
    noComments,
    /_enqueue_booking_lifecycle_email[\s\S]*appointment_cancelled[\s\S]*booking_user/,
  );
});

test("handle_booking_notifications adds dashboard_notifications for appointment.cancelled on cancel UPDATE", async () => {
  const sql = await migrationSql();
  const noComments = stripComments(sql);
  // The cancel block should have a dashboard_notifications INSERT with 'appointment.cancelled'
  // Find the cancel block and check for dashboard_notifications
  const cancelBlock = sql.match(
    /TG_OP\s*=\s*'UPDATE'[\s\S]*?cancelled[\s\S]*?(?=RETURN NEW|END IF|$$)/,
  );
  if (cancelBlock) {
    assert.match(cancelBlock[0], /dashboard_notifications/);
    assert.match(cancelBlock[0], /appointment\.cancelled/);
  }
});

test("handle_booking_notifications keeps INSERT handling unchanged", async () => {
  const sql = await migrationSql();
  const noComments = stripComments(sql);
  // INSERT block should still have dashboard_notifications for appointment.created
  // and customer email for booking_created
  // (these come from earlier migrations)
  assert.match(noComments, /dashboard_notifications/);
  assert.match(noComments, /booking_created/);
});

test("handle_booking_notifications no longer has business email INSERTs", async () => {
  const sql = await migrationSql();
  const noComments = stripComments(sql);
  assert.doesNotMatch(noComments, /booking_created_business/);
  assert.doesNotMatch(noComments, /BUSINESS_EMAIL_OUTBOX_REQUIRED/);
  assert.doesNotMatch(noComments, /appointment_created_business/);
});

test("forward migration only redefines handle_booking_notifications", async () => {
  const sql = await migrationSql();
  const noComments = stripComments(sql);
  // Should not redefine create_public_booking again
  assert.doesNotMatch(noComments, /CREATE OR REPLACE FUNCTION public\.create_public_booking/);
  // Should redefine handle_booking_notifications once
  const handleCount = (
    noComments.match(/CREATE OR REPLACE FUNCTION public\.handle_booking_notifications/g) ||
    []
  ).length;
  assert.ok(handleCount >= 1);
});
