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

function expectCustomerEmailPath(source: string, templateNames: RegExp, recipientPath: RegExp): void {
  const hasSendPath = /queueHtmlEmail\s*\(|sendHtmlEmail\s*\(/.test(source) && templateNames.test(source) && recipientPath.test(source);
  const hasOutboxPath = /notification_email_outbox/.test(source) && /template_key/.test(source) && templateNames.test(source);

  expect(
    hasSendPath || hasOutboxPath,
    'Expected the real appointment flow to enqueue notification_email_outbox or queue repository-rendered email to the customer.',
  ).toBe(true);
}

function expectAdminDashboardNotificationPath(source: string, eventRpcName: string): void {
  expect(source).toMatch(new RegExp(`rpc\\(\\s*['"]${eventRpcName}['"]`));
  expect(source).toMatch(/bookingId|booking_id|appointmentId|appointment_id/);
}

describe('Orvel REAL appointment flows notification wiring RED contracts', () => {
  it('public appointment creation enqueues/sends customer confirmation email and creates an admin dashboard notification', () => {
    const createPublicBookingSource = gatewayMethodSource('createPublicBooking', 'manageBookingByToken');
    const sql = readSqlCorpus();

    expect(createPublicBookingSource).toMatch(/rpc\(\s*['"]create_public_booking['"]/);
    expectCustomerEmailPath(`${createPublicBookingSource}\n${sql}`, /booking_created|appointment_confirmation|renderAppointmentConfirmationEmail/i, /payload\.client\.email|client->>'email'|to_email/i);
    expectAdminDashboardNotificationPath(createPublicBookingSource, 'create_dashboard_notification_for_appointment_created');
  });

  it('customer cancellation by token enqueues/sends customer cancellation email and creates an admin dashboard notification', () => {
    const cancelByTokenSource = gatewayMethodSource('cancelBookingByToken', 'rescheduleBookingByToken');

    expect(cancelByTokenSource).toMatch(/rpc\(\s*['"]cancel_booking_by_token['"]/);
    expectCustomerEmailPath(cancelByTokenSource, /booking_cancelled|appointment_cancellation|renderAppointmentCancellationEmail/i, /customer\.email|toEmail|to_email|email/i);
    expectAdminDashboardNotificationPath(cancelByTokenSource, 'create_dashboard_notification_for_appointment_cancelled');
  });

  it('customer reschedule by token enqueues/sends customer reschedule email and creates an admin dashboard notification', () => {
    const rescheduleByTokenSource = gatewayMethodSource('rescheduleBookingByToken', 'createAdminManualBooking');

    expect(rescheduleByTokenSource).toMatch(/rpc\(\s*['"]reschedule_booking_by_token['"]/);
    expectCustomerEmailPath(rescheduleByTokenSource, /booking_rescheduled|appointment_reschedule|renderAppointmentRescheduleEmail/i, /customer\.email|toEmail|to_email|email/i);
    expectAdminDashboardNotificationPath(rescheduleByTokenSource, 'create_dashboard_notification_for_appointment_rescheduled');
  });

  it('24h reminder trigger only sends when enabled and prevents duplicate reminders', () => {
    const sql = readSqlCorpus().toLowerCase();

    expect(sql).toMatch(/create\s+(or\s+replace\s+)?function\s+public\.(send|enqueue)_appointment_reminders_24h\s*\(/);
    expect(sql).toMatch(/send_appointment_reminders_24h\s*=\s*true|coalesce\(\s*bs\.send_appointment_reminders_24h\s*,\s*false\s*\)/);
    expect(sql).toMatch(/notification_email_outbox[\s\S]*appointment_reminder_24h|appointment_reminder_24h[\s\S]*notification_email_outbox/);
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
