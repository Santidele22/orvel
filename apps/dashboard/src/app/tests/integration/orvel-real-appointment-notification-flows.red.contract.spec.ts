import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CWD = process.cwd();

function findRepoRoot(startDir: string): string {
  let currentDir = path.resolve(startDir);

  while (true) {
    if (
      fs.existsSync(path.join(currentDir, 'supabase', 'migrations')) &&
      fs.existsSync(path.join(currentDir, 'apps', 'dashboard'))
    ) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(`Unable to locate Orvel repo root from ${startDir}`);
    }

    currentDir = parentDir;
  }
}

const REPO_ROOT = findRepoRoot(CWD);
const DASHBOARD_ROOT = path.join(REPO_ROOT, 'apps', 'dashboard');
const REAL_GATEWAY_PATH = path.join(DASHBOARD_ROOT, 'src', 'app', 'core', 'api', 'supabase-booking', 'real-gateway.ts');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');

function readRealGatewaySource(): string {
  expect(fs.existsSync(REAL_GATEWAY_PATH), `Missing real appointment gateway: ${REAL_GATEWAY_PATH}`).toBe(true);
  return fs.readFileSync(REAL_GATEWAY_PATH, 'utf8');
}

function readSqlCorpus(): string {
  expect(fs.existsSync(MIGRATIONS_DIR), `Missing migrations directory: ${MIGRATIONS_DIR}`).toBe(true);

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .map((entry) => fs.readFileSync(path.join(MIGRATIONS_DIR, entry), 'utf8'))
    .join('\n\n');
}

function gatewayMethodSource(methodName: string, nextMethodName: string): string {
  const source = readRealGatewaySource();
  const start = source.indexOf(`async ${methodName}`);
  const end = source.indexOf(`\n  async ${nextMethodName}`, start + 1);

  expect(start, `Missing real gateway method ${methodName}`).toBeGreaterThanOrEqual(0);
  expect(end, `Missing following real gateway method ${nextMethodName}`).toBeGreaterThan(start);

  return source.slice(start, end);
}

function expectNoOutboxPath(source: string, templateNames: RegExp, recipientPath: RegExp): void {
  // Phase 2 (release 2.0) dropped the notification_email_outbox table. Active migrations must
  // not re-introduce the legacy outbox enqueue path for these appointment templates.
  // The browser-side flow is also asserted to never touch the outbox (see negative asserts
  // above). recipientPath is intentionally retained for call-site symmetry with the previous
  // helper signature; it has no semantic role in the post-Phase 2 contract.
  const hasOutboxPath =
    /notification_email_outbox/.test(source) && /template_key/.test(source) && templateNames.test(source);

  expect(
    hasOutboxPath,
    `Active migrations must not enqueue ${templateNames.source} via the legacy notification_email_outbox (schema 2.0).`,
  ).toBe(false);

  void recipientPath;
}

function expectAdminDashboardNotificationPath(source: string, eventRpcName: string): void {
  expect(source).toMatch(new RegExp(`rpc\\(\\s*['"]${eventRpcName}['"]`));
  expect(source).toMatch(/bookingId|booking_id|appointmentId|appointment_id/);
}

describe('Orvel REAL appointment flows notification wiring RED contracts', () => {
  it('public appointment creation does not enqueue the legacy notification_email_outbox from the browser', () => {
    const createPublicBookingSource = gatewayMethodSource('createPublicBooking', 'manageBookingByToken');
    const sql = readSqlCorpus();

    expect(createPublicBookingSource).toMatch(/rpc\(\s*['"]create_public_booking['"]/);
    expect(createPublicBookingSource).toMatch(/db_atomic_visibility_notifications/);
    expect(createPublicBookingSource).not.toMatch(/create_dashboard_notification_for_appointment_created|notification_email_outbox|get_booking_notification_context/i);
    expectNoOutboxPath(sql, /appointment_confirmation/i, /v_customer_email|to_email/i);
    expectNoOutboxPath(sql, /appointment_created_business/i, /v_business_email|to_email/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.dashboard_notifications[\s\S]*appointment\.created/i);
  });

  it('customer cancellation by token does not enqueue the legacy notification_email_outbox from the browser', () => {
    const cancelByTokenSource = gatewayMethodSource('cancelBookingByToken', 'rescheduleBookingByToken');
    const sql = readSqlCorpus();

    expect(cancelByTokenSource).toMatch(/rpc\(\s*['"]cancel_booking_by_token['"]/);
    expect(cancelByTokenSource).not.toMatch(/notification_email_outbox|booking_cancelled|appointment_cancellation|renderAppointmentCancellationEmail/i);
    expectNoOutboxPath(sql, /booking_cancelled_business/i, /v_business_email|to_email/i);
    expectAdminDashboardNotificationPath(cancelByTokenSource, 'create_dashboard_notification_for_appointment_cancelled');
  });

  it('customer reschedule by token does not enqueue the legacy notification_email_outbox from the browser', () => {
    const rescheduleByTokenSource = gatewayMethodSource('rescheduleBookingByToken', 'createAdminManualBooking');
    const sql = readSqlCorpus();

    expect(rescheduleByTokenSource).toMatch(/rpc\(\s*['"]reschedule_booking_by_token['"]/);
    expect(rescheduleByTokenSource).not.toMatch(/notification_email_outbox|booking_rescheduled|appointment_reschedule(?:\b|_email)|renderAppointmentRescheduleEmail/i);
    expectNoOutboxPath(sql, /booking_rescheduled/i, /v_customer_email|to_email/i);
    expectAdminDashboardNotificationPath(rescheduleByTokenSource, 'create_dashboard_notification_for_appointment_rescheduled');
  });

  it('24h reminder trigger does not enqueue the legacy notification_email_outbox (schema 2.0)', () => {
    const sql = readSqlCorpus().toLowerCase();

    expect(sql).not.toMatch(/notification_email_outbox[\s\S]*appointment_reminder_24h|appointment_reminder_24h[\s\S]*notification_email_outbox/);
  });

  it.skip('24h reminder trigger only sends when enabled and prevents duplicate reminders (deferred — depends on new email mechanism in schema 2.0)', () => {
    const sql = readSqlCorpus().toLowerCase();

    expect(sql).toMatch(/create\s+(or\s+replace\s+)?function\s+public\.(send|enqueue)_appointment_reminders_24h\s*\(/);
    expect(sql).toMatch(/send_appointment_reminders_24h\s*=\s*true|coalesce\(\s*bs\.send_appointment_reminders_24h\s*,\s*false\s*\)/);
    expect(sql).toMatch(/unique[\s\S]*(booking_id|appointment_id)[\s\S]*appointment_reminder_24h|on\s+conflict[\s\S]*(do\s+nothing|where)[\s\S]*appointment_reminder_24h|not\s+exists[\s\S]*appointment_reminder_24h/);
  });

  it('24h reminder trigger is restricted to service role to prevent public abuse', () => {
    const sql = readSqlCorpus().toLowerCase();

    expect(sql).toMatch(/auth\.role\(\)\s*<>\s*'service_role'|auth\.role\(\)\s*=\s*'service_role'/);
    expect(sql).toMatch(/revoke\s+execute\s+on\s+function\s+public\.enqueue_appointment_reminders_24h\s*\(\s*\)\s+from\s+public/);
    expect(sql).toMatch(/revoke\s+execute\s+on\s+function\s+public\.enqueue_appointment_reminders_24h[\s\S]*from\s+anon/);
    expect(sql).toMatch(/revoke\s+execute\s+on\s+function\s+public\.enqueue_appointment_reminders_24h[\s\S]*from\s+authenticated/);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.enqueue_appointment_reminders_24h[\s\S]*to\s+service_role/);
  });
});
