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

describe('Admin booking cancel RPC contract', () => {
  it('wires the admin list cancel action to the soft-cancel service path', () => {
    // Arrange
    const template = readRequiredFile(path.join(DASHBOARD_ROOT, 'src/app/features/booking/pages/turnos-list.page.html'));
    const page = readRequiredFile(path.join(DASHBOARD_ROOT, 'src/app/features/booking/pages/turnos-list.page.ts'));

    // Act / Assert
    expect(template).toMatch(/\(click\)="cancelTurno\(turno\)"[\s\S]{0,160}data-testid="turno-admin-cancel-action"/i);
    expect(page).toMatch(/protected async cancelTurno\(turno: TurnoWithRelations\)[\s\S]{0,420}this\.turnoService\.cancelByAdmin\(turno\.id/i);
    expect(page).toMatch(/cancelTurno\(turno: TurnoWithRelations\)[\s\S]{0,760}await this\.refreshTurnosFromSource\(\)/i);
  });

  it('allows admin cancellation for active bookings and rejects terminal bookings', () => {
    // Arrange
    const migration = readRequiredFile(path.join(REPO_ROOT, 'supabase/migrations/_legacy/20260628123000_fix_admin_booking_cancel_status_scope.sql'));

    // Act / Assert
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.cancel_admin_booking/i);
    expect(migration).toMatch(/v_booking\.status IN \('cancelled', 'canceled', 'completed', 'no_show'\)/i);
    expect(migration).toMatch(/public\._raise_rpc\('TURNO_INVALID_STATUS_TRANSITION'\)/i);
    expect(migration).toMatch(/SET status = 'cancelled'/i);
    expect(migration).not.toMatch(/WHERE[\s\S]{0,120}status = 'confirmed'/i);
  });

  it('requires direct authenticated RPC callers to provide branch scope and denies cross-branch cancellation', () => {
    // Arrange
    const migration = readRequiredFile(path.join(REPO_ROOT, 'supabase/migrations/_legacy/20260628134500_require_branch_scope_for_admin_cancel.sql'));
    const service = readRequiredFile(path.join(DASHBOARD_ROOT, 'src/app/features/booking/data-access/turno.service.ts'));

    // Act / Assert
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.cancel_admin_booking\(\s*booking_id uuid,\s*branch_id uuid,\s*performed_by uuid DEFAULT NULL,\s*notes text DEFAULT NULL,\s*reason text DEFAULT NULL\s*\)/i);
    expect(migration).not.toMatch(/branch_id uuid DEFAULT/i);
    expect(migration).toMatch(/auth\.role\(\) <> 'service_role' AND cancel_admin_booking\.branch_id IS NULL[\s\S]{0,120}_raise_rpc\('ACTIVE_BRANCH_REQUIRED'\)/i);
    expect(migration).toMatch(/cancel_admin_booking\.branch_id IS NOT NULL AND v_booking\.branch_id IS DISTINCT FROM cancel_admin_booking\.branch_id[\s\S]{0,120}_raise_rpc\('UNAUTHORIZED'\)/i);
    expect(service).toMatch(/const branchScope = await this\.assertBookingInActiveBranch\(supabase, payload\.bookingId\)/i);
    expect(service).toMatch(/rpc\('cancel_admin_booking',[\s\S]{0,160}branch_id: branchScope\.branchId/i);
  });

  it('keeps the old 4-arg RPC signature as a fail-closed compatibility wrapper', () => {
    // Arrange
    const migration = readRequiredFile(path.join(REPO_ROOT, 'supabase/migrations/_legacy/20260628133000_restore_admin_cancel_compat_defaults.sql'));

    // Act / Assert
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.cancel_admin_booking\(\s*booking_id uuid,\s*performed_by uuid DEFAULT NULL,\s*notes text DEFAULT NULL,\s*reason text DEFAULT NULL\s*\)/i);
    expect(migration).toMatch(/record_admin_booking_cancel_failure\([\s\S]{0,180}'CLIENT_UPGRADE_REQUIRED'[\s\S]{0,80}409[\s\S]{0,80}false/i);
    expect(migration).toMatch(/public\._raise_rpc\('CLIENT_UPGRADE_REQUIRED'\)/i);
    expect(migration).not.toMatch(/public\.cancel_admin_booking\(booking_id,\s*NULL::uuid|can_manage_business\([\s\S]{0,160}UPDATE public\.bookings/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.cancel_admin_booking\(uuid, uuid, text, text\) TO authenticated, service_role/i);
  });

  it('adds durable sanitized telemetry for admin cancel failures and wires the UI failure path to it', () => {
    // Arrange
    const migration = readRequiredFile(path.join(REPO_ROOT, 'supabase/migrations/_legacy/20260628131500_admin_cancel_failure_telemetry_compat.sql'));
    const service = readRequiredFile(path.join(DASHBOARD_ROOT, 'src/app/features/booking/data-access/turno.service.ts'));
    const page = readRequiredFile(path.join(DASHBOARD_ROOT, 'src/app/features/booking/pages/turnos-list.page.ts'));
    const telemetryTable = migration.match(/CREATE TABLE IF NOT EXISTS public\.admin_booking_cancel_failure_events \([\s\S]*?\);/i)?.[0] ?? '';

    // Act / Assert
    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.admin_booking_cancel_failure_events/i);
    expect(migration).toMatch(/stage\s+text\s+not\s+null\s+check\s*\(stage\s+in\s*\('rpc',\s*'ui'\)\)/i);
    expect(migration).toMatch(/code\s+text\s+not\s+null\s+check\s*\(code\s+~\s+'\^\[A-Z0-9_:-\]\{1,64\}\$'\)/i);
    expect(migration).toMatch(/security\s+definer[\s\S]*set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
    expect(migration).toMatch(/revoke\s+all\s+on\s+table\s+public\.admin_booking_cancel_failure_events\s+from\s+anon,\s*authenticated/i);
    expect(telemetryTable).not.toMatch(/\b(?:message|error|stack|details|booking_id|branch_id|business_id)\b/i);
    expect(service).toMatch(/recordAdminCancelFailureTelemetry[\s\S]{0,420}record_admin_booking_cancel_failure/i);
    expect(page).toMatch(/buildAdminCancelFailurePresentation\(error\)[\s\S]{0,520}recordAdminCancelFailureTelemetry\(\{[\s\S]{0,160}code: failure\.telemetryCode/i);
  });

  it('keeps admin cancellation email delivery owned by the bookings update trigger', () => {
    // Arrange
    const lifecycleMigration = readRequiredFile(path.join(REPO_ROOT, 'supabase/migrations/_legacy/20260628120000_booking_lifecycle_email_outbox.sql'));
    const service = readRequiredFile(path.join(DASHBOARD_ROOT, 'src/app/features/booking/data-access/turno.service.ts'));

    // Act / Assert
    expect(lifecycleMigration).toMatch(/OLD\.status IS DISTINCT FROM 'cancelled'[\s\S]*NEW\.status = 'cancelled'[\s\S]*'booking_cancelled_business'/i);
    expect(service).not.toMatch(/return from\(this\.cancelByAdminWithSupabase[\s\S]{0,260}notificationService\?\.emit/);
  });
});
