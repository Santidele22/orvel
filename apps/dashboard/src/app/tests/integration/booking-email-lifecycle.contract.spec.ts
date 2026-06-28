import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DIR = path.dirname(new URL(import.meta.url).pathname);
const DASHBOARD_ROOT = path.resolve(TEST_DIR, '../../../..');
const REPO_ROOT = path.resolve(DASHBOARD_ROOT, '../..');

function readRequiredFile(filePath: string): string {
  expect(fs.existsSync(filePath), `Missing file: ${path.relative(REPO_ROOT, filePath)}`).toBe(true);
  return fs.readFileSync(filePath, 'utf8');
}

describe('Booking lifecycle email notifications contract', () => {
  it('centralizes the lifecycle matrix in a forward-only Supabase migration', () => {
    // Arrange
    const migration = readRequiredFile(path.join(REPO_ROOT, 'supabase/migrations/20260628120000_booking_lifecycle_email_outbox.sql'));

    // Act / Assert
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS lifecycle_event_key text/i);
    expect(migration).toMatch(/notification_email_outbox_lifecycle_event_key_idx/i);
    expect(migration).toMatch(/ON CONFLICT \(lifecycle_event_key\)[\s\S]*DO NOTHING/i);
      expect(migration).toMatch(/'appointment_confirmation'[\s\S]*'booking:' \|\| NEW\.id::text \|\| ':created:booking_user'/i);
      expect(migration).toMatch(/'booking_created_business'[\s\S]*'booking:' \|\| NEW\.id::text \|\| ':created:business_client'/i);
      expect(migration).toMatch(/NEW\.status = 'cancelled'[\s\S]*'booking_cancelled_business'[\s\S]*':cancelled:business_client'/i);
      expect(migration).toMatch(/OLD\.starts_at IS DISTINCT FROM NEW\.starts_at[\s\S]*'booking_rescheduled'[\s\S]*':rescheduled:' \|\| NEW\.starts_at::text \|\| ':' \|\| COALESCE\(NEW\.updated_at::text, statement_timestamp\(\)::text\) \|\| ':booking_user'/i);
      expect(migration).toContain("'recipient_role', p_recipient_role");
      expect(migration).not.toMatch(/:rescheduled:(usuario|booking_user)'/i);
  });

  it('does not keep browser/app-side notification_email_outbox inserts in the real booking gateway', () => {
    // Arrange
    const gateway = readRequiredFile(path.join(DASHBOARD_ROOT, 'src/app/core/api/supabase-booking/real-gateway.ts'));

    // Act / Assert
    expect(gateway).not.toMatch(/\.from\(['"]notification_email_outbox['"]\)\.insert\(/);
    expect(gateway).toMatch(/create_dashboard_notification_for_appointment_created/);
    expect(gateway).toMatch(/create_dashboard_notification_for_appointment_cancelled/);
    expect(gateway).toMatch(/create_dashboard_notification_for_appointment_rescheduled/);
  });

  it('renders distinct booking-user and business-client lifecycle templates through the Mailtrap outbox processor', () => {
    // Arrange
    const processor = readRequiredFile(path.join(REPO_ROOT, 'supabase/functions/process-email-outbox/index.ts'));
    const templates = readRequiredFile(path.join(REPO_ROOT, 'supabase/functions/_shared/templates/appointment-templates.ts'));

    // Act / Assert
    expect(processor).toMatch(/MAILTRAP_API_URL/);
    expect(processor).toMatch(/renderAppointmentConfirmationEmail/);
    expect(processor).toMatch(/renderAppointmentRescheduleEmail/);
    expect(processor).toMatch(/booking_cancelled_business[\s\S]*renderAppointmentBusinessCancellationEmail/);
    expect(templates).toMatch(/export function renderAppointmentBusinessCancellationEmail/);
      expect(templates).toMatch(/business_cancellation/);
  });

  it('uses clear internal recipient roles and avoids inert appointment action links', () => {
    const migration = readRequiredFile(path.join(REPO_ROOT, 'supabase/migrations/20260628120000_booking_lifecycle_email_outbox.sql'));
    const processor = readRequiredFile(path.join(REPO_ROOT, 'supabase/functions/process-email-outbox/index.ts'));
    const templates = readRequiredFile(path.join(REPO_ROOT, 'supabase/functions/_shared/templates/appointment-templates.ts'));

    expect(migration).toMatch(/'booking_user'/);
    expect(migration).toMatch(/'business_client'/);
    expect(migration).not.toMatch(/'usuario'|'cliente'/);
    expect(processor).not.toMatch(/view: "#"|cancel: "#"|reschedule: "#"|return "#"/);
    expect(templates).not.toMatch(/href="\$\{escapeAttribute\([^}]+\)\}"[\s\S]*safeAppointmentLink\([^)]*\): string[\s\S]*return '#'/);
    expect(templates).not.toContain('href="#"');
    expect(templates).toMatch(/renderSecondaryActions/);
  });

  it('documents deployment order and concrete outbox recovery operations', () => {
    const runbook = readRequiredFile(path.join(REPO_ROOT, 'docs/runbooks/supabase-migrations.md'));

    expect(runbook).toMatch(/Deploy `process-email-outbox` first/i);
    expect(runbook).toMatch(/supabase functions deploy process-email-outbox/);
    expect(runbook).toMatch(/supabase db push/);
    expect(runbook).toMatch(/processing_claim_id = null/);
    expect(runbook).toMatch(/sent_at is null/i);
    expect(runbook).toMatch(/type = INSERT[\s\S]*table = notification_email_outbox[\s\S]*record = <row>/i);
    expect(runbook).toMatch(/fix-forward/i);
  });
});
