import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
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
    const gateway = readRequiredFile(path.join(REPO_ROOT, 'packages/booking/src/infrastructure/supabase/real-gateway.ts'));

    // Act / Assert
    expect(gateway).not.toMatch(/\.from\(['"]notification_email_outbox['"]\)\.insert\(/);
    expect(gateway).not.toMatch(/create_dashboard_notification_for_appointment_created/);
    expect(gateway).toMatch(/create_dashboard_notification_for_appointment_cancelled/);
    expect(gateway).toMatch(/create_dashboard_notification_for_appointment_rescheduled/);
  });

  it('renders distinct booking-user and business-client lifecycle templates through the Resend outbox processor', () => {
    // Arrange
    const processor = readRequiredFile(path.join(REPO_ROOT, 'supabase/functions/process-email-outbox/index.ts'));
    const sharedTemplates = readRequiredFile(path.join(REPO_ROOT, 'apps/shared/email-templates/appointment-templates.ts'));

    // Act / Assert
    expect(processor).toMatch(/send\.api\.mailtrap\.io/);
    expect(processor).toMatch(/api\.resend\.com\/emails/);
    expect(processor).toMatch(/MAILTRAP_API_TOKEN/);
    expect(processor).toMatch(/RESEND_API_KEY/);
    const mailtrapTokenIndex = processor.search(/MAILTRAP_API_TOKEN/);
    const resendKeyIndex = processor.search(/RESEND_API_KEY/);
    expect(mailtrapTokenIndex).toBeGreaterThan(-1);
    expect(resendKeyIndex).toBeGreaterThan(mailtrapTokenIndex);
    expect(processor).toMatch(/email_provider_config_missing/);
    expect(processor).toMatch(/mailtrap_error/);
    expect(processor).toMatch(/resend_error/);
    expect(processor).toMatch(/renderAppointmentConfirmationEmail/);
    expect(processor).toMatch(/renderAppointmentRescheduleEmail/);
    // Post-1.0.1 PR #2 + 1.0.2 PR #3 (email-templates-shared): the processor no longer
    // routes business-recipient emails. The owner email is no longer enqueued for
    // ordinary booking events. This contract locks that decision.
    expect(processor).not.toMatch(/booking_cancelled_business/);
    expect(processor).not.toMatch(/booking_created_business/);
    expect(sharedTemplates).toMatch(/export function renderAppointmentConfirmationEmail/);
      expect(sharedTemplates).toMatch(/export function renderAppointmentRescheduleEmail/);
  });

  it('uses clear internal recipient roles and avoids inert appointment action links', () => {
    const migration = readRequiredFile(path.join(REPO_ROOT, 'supabase/migrations/20260628120000_booking_lifecycle_email_outbox.sql'));
    const processor = readRequiredFile(path.join(REPO_ROOT, 'supabase/functions/process-email-outbox/index.ts'));
    const sharedTemplates2 = readRequiredFile(path.join(REPO_ROOT, 'apps/shared/email-templates/appointment-templates.ts'));

    expect(migration).toMatch(/'booking_user'/);
    expect(migration).toMatch(/'business_client'/);
    expect(migration).not.toMatch(/'usuario'|'cliente'/);
    expect(processor).not.toMatch(/view: "#"|cancel: "#"|reschedule: "#"|return "#"/);
    expect(sharedTemplates2).not.toMatch(/href="\$\{escapeAttribute\([^}]+\)\}"[\s\S]*safeAppointmentLink\([^)]*\): string[\s\S]*return '#'/);
    expect(sharedTemplates2).not.toContain('href="#"');
    expect(sharedTemplates2).toMatch(/renderSecondaryActions/);
  });

  it('safely formats business notification address, price, duration, and schedule fields', () => {
    const migration = readRequiredFile(path.join(REPO_ROOT, 'supabase/migrations/20260704140000_fix_public_booking_dashboard_and_email_contracts.sql'));
    const processor = readRequiredFile(path.join(REPO_ROOT, 'supabase/functions/process-email-outbox/index.ts'));
    const sharedTemplates3 = readRequiredFile(path.join(REPO_ROOT, 'apps/shared/email-templates/appointment-templates.ts'));

    expect(migration).toMatch(/'business_address'[\s\S]*COALESCE\(br\.address, ''\)/i);
    expect(migration).toMatch(/'duration_minutes'[\s\S]*EXTRACT\(EPOCH FROM \(p_booking\.ends_at - p_booking\.starts_at\)\)/i);
    expect(migration).toMatch(/'price'[\s\S]*COALESCE\(s\.price, 0\)/i);
    expect(migration).toMatch(/'time'[\s\S]*to_char\(p_booking\.starts_at AT TIME ZONE/i);
    expect(processor).toMatch(/branch:branches\(address\)/);
    expect(processor).toMatch(/firstNonBlank\(branch\?\.address, fullData\.business_address, fullData\.branch_address\)/);
    expect(processor).toMatch(/finiteNumber\(bookingRow\.price_at_booking\) \?\? finiteNumber\(service\?\.price\)/);
    expect(processor).toMatch(/minutesBetween\(bookingRow\.starts_at, bookingRow\.ends_at\)/);
    expect(sharedTemplates3).toMatch(/Number\.isFinite\(price\)/);
    expect(sharedTemplates3).toMatch(/Number\.isFinite\(duration\)/);
  });

  it('hardens public booking business recipient resolution and logs skipped owner emails', () => {
    const migration = readRequiredFile(path.join(REPO_ROOT, 'supabase/migrations/20260704193000_harden_public_booking_business_email_recipient.sql'));

    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\._resolve_booking_business_email/);
    expect(migration).toMatch(/bs\.support_email/);
    expect(migration).toMatch(/JOIN auth\.users u ON u\.id = b\.owner_id/i);
    expect(migration).toMatch(/public\.business_members bm[\s\S]*lower\(COALESCE\(bm\.role, ''\)\) = 'owner'/i);
    expect(migration).toMatch(/v_business_email := public\._resolve_booking_business_email\(v_business_id\)/);
    expect(migration).toMatch(/'appointment_created_business'/);
    expect(migration).toMatch(/RAISE LOG 'Orvel public booking business email skipped/);
    expect(migration).toMatch(/RAISE LOG 'Orvel booking lifecycle email skipped: missing recipient/);
  });

  it.skip('documents deployment order and concrete outbox recovery operations (outbox purged in release-2.0)', () => {
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
