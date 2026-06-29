import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const TEST_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(TEST_DIR, '../../../../../..');
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase/migrations/20260628143000_enforce_reschedule_canonical_availability.sql'
);
const EMAIL_LIFECYCLE_PATH = path.join(
  REPO_ROOT,
  'supabase/migrations/20260628120000_booking_lifecycle_email_outbox.sql'
);
const ROLLBACK_SMOKE_PATH = path.join(
  REPO_ROOT,
  'supabase/checks/20260628143000_reschedule_canonical_availability_smoke.sql'
);
const HARDENING_MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase/migrations/20260628145500_harden_reschedule_rpc_execute_grants.sql'
);
const BRANCH_SCOPE_MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase/migrations/20260628152000_admin_reschedule_branch_scope_telemetry.sql'
);
const BRANCH_GUARD_SEMANTICS_MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase/migrations/20260628161000_document_admin_reschedule_branch_guard.sql'
);
const TURNO_SERVICE_PATH = path.join(
  REPO_ROOT,
  'apps/dashboard/src/app/features/booking/data-access/turno.service.ts'
);
const TURNOS_LIST_PAGE_PATH = path.join(
  REPO_ROOT,
  'apps/dashboard/src/app/features/booking/pages/turnos-list.page.ts'
);
const TURNO_FORM_PAGE_PATH = path.join(
  REPO_ROOT,
  'apps/dashboard/src/app/features/booking/pages/turno-form.page.ts'
);
const MANAGE_BOOKING_PAGE_PATH = path.join(
  REPO_ROOT,
  'apps/dashboard/src/app/features/booking/pages/public/manage-booking.page.ts'
);

function readRequiredFile(filePath: string): string {
  expect(existsSync(filePath), `Missing file: ${path.relative(REPO_ROOT, filePath)}`).toBe(true);
  return readFileSync(filePath, 'utf8');
}

function extractFunction(sql: string, name: string, nextName: string): string {
  return sql.match(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}[\\s\\S]*?CREATE OR REPLACE FUNCTION public\\.${nextName}`, 'i')
  )?.[0] ?? '';
}

describe('Booking lifecycle reschedule canonical availability contract', () => {
  it('enforces canonical availability before public token reschedule mutates a booking', () => {
    const migration = readRequiredFile(MIGRATION_PATH);
    const publicReschedule = migration.match(
      /CREATE OR REPLACE FUNCTION public\.reschedule_booking_by_token[\s\S]*?CREATE OR REPLACE FUNCTION public\.reschedule_admin_booking/i
    )?.[0] ?? '';

    expect(publicReschedule).toMatch(/v_now timestamptz := now\(\)/i);
    expect(publicReschedule).not.toMatch(/now_iso::timestamptz/i);
    expect(publicReschedule).toMatch(/public\._load_manageable_booking\(token, v_now\)/i);
    expect(publicReschedule).toMatch(/public\._query_booking_slot_availability\(/i);
    expect(publicReschedule).toMatch(/v_booking\.service_id::uuid/i);
    expect(publicReschedule).toMatch(/v_booking\.id,\s*\n\s*true/i);
    expect(publicReschedule).toMatch(/availability\.starts_at_iso::timestamptz = v_starts_at/i);
    expect(publicReschedule).toMatch(/v_matching_slot_count < 1[\s\S]{0,80}_raise_rpc\('SLOT_CONFLICT'\)/i);
    expect(publicReschedule).toMatch(/public\._lock_booking_conflict_window/i);
    expect(publicReschedule).toMatch(/public\._assert_no_slot_conflict/i);
  });

  it('keeps public manage bearers hash-only and exposes deterministic closed-token failures', () => {
    const migration = readRequiredFile(MIGRATION_PATH);
    const loadManageable = extractFunction(migration, '_load_manageable_booking', 'reschedule_booking_by_token');

    expect(loadManageable).toMatch(/bk\.manage_token_hash = public\._hash_manage_token\(p_token\)/i);
    expect(loadManageable).not.toMatch(/bk\.manage_token\s*=/i);
    expect(loadManageable).toMatch(/v_now timestamptz := now\(\)/i);
    expect(loadManageable).toMatch(/manage_token_expires_at <= v_now/i);
    expect(loadManageable).not.toMatch(/manage_token_expires_at <= p_now/i);
    expect(loadManageable).toMatch(/manage_token_revoked_at IS NOT NULL[\s\S]{0,220}_raise_rpc\('TOKEN_REVOKED'\)/i);
    expect(loadManageable).toMatch(/status IN \('cancelled', 'canceled'\)[\s\S]{0,120}_raise_rpc\('BOOKING_ALREADY_CANCELLED'\)/i);
  });

  it('does not trust caller-provided now_iso for public manage/cancel/reschedule policy checks', () => {
    const migration = readRequiredFile(MIGRATION_PATH);
    const publicReschedule = extractFunction(migration, 'reschedule_booking_by_token', 'manage_booking_by_token');
    const publicManage = extractFunction(migration, 'manage_booking_by_token', 'cancel_booking_by_token');
    const publicCancel = extractFunction(migration, 'cancel_booking_by_token', 'reschedule_admin_booking');

    for (const functionBody of [publicReschedule, publicManage, publicCancel]) {
      expect(functionBody).toMatch(/v_now timestamptz := now\(\)/i);
      expect(functionBody).not.toMatch(/now_iso::timestamptz/i);
      expect(functionBody).not.toMatch(/v_now\s*:=\s*now_iso/i);
    }

    expect(publicManage).toMatch(/starts_at <= v_now/i);
    expect(publicManage).toMatch(/can_cancel_or_reschedule[\s\S]{0,140}> v_now/i);
    expect(publicCancel).toMatch(/make_interval\(mins => COALESCE\(v_window, 60\)\) <= v_now/i);
    expect(publicReschedule).toMatch(/make_interval\(mins => COALESCE\(v_window, 60\)\) <= v_now/i);
  });

  it('enforces canonical availability and terminal status guards before admin reschedule mutates a booking', () => {
    const migration = readRequiredFile(MIGRATION_PATH);
    const adminReschedule = migration.match(
      /CREATE OR REPLACE FUNCTION public\.reschedule_admin_booking\(\s*booking_id uuid,[\s\S]*?CREATE OR REPLACE FUNCTION public\.reschedule_admin_booking\(\s*booking_id uuid,\s*starts_at_iso text,\s*performed_by text/i
    )?.[0] ?? '';

    expect(adminReschedule).toMatch(/auth\.role\(\) <> 'service_role'[\s\S]{0,120}public\.can_manage_business/i);
    expect(adminReschedule).toMatch(/v_booking\.status IN \('cancelled', 'canceled', 'completed', 'no_show'\)[\s\S]{0,100}TURNO_INVALID_STATUS_TRANSITION/i);
    expect(adminReschedule).toMatch(/public\._query_booking_slot_availability\(/i);
    expect(adminReschedule).toMatch(/v_booking\.id,\s*\n\s*true/i);
    expect(adminReschedule).toMatch(/availability\.starts_at_iso::timestamptz = v_starts_at/i);
    expect(adminReschedule).toMatch(/v_matching_slot_count < 1[\s\S]{0,80}_raise_rpc\('SLOT_CONFLICT'\)/i);
  });

  it('keeps lifecycle email delivery trigger-owned with no reschedule app-side duplicate requirement', () => {
    const migration = readRequiredFile(MIGRATION_PATH);
    const emailLifecycle = readRequiredFile(EMAIL_LIFECYCLE_PATH);

    expect(migration).not.toMatch(/notification_email_outbox|_enqueue_booking_lifecycle_email|booking_rescheduled/i);
    expect(emailLifecycle).toMatch(/OLD\.starts_at IS DISTINCT FROM NEW\.starts_at[\s\S]*'booking_rescheduled'/i);
  });

  it('ships rollback-safe remote smoke SQL for executable behavior evidence after Supabase push', () => {
    const smoke = readRequiredFile(ROLLBACK_SMOKE_PATH);

    expect(smoke).toMatch(/BEGIN;/i);
    expect(smoke).toMatch(/ROLLBACK;/i);
    expect(smoke).toMatch(/supabase@latest db query --linked/i);
    expect(smoke).toMatch(/manage_booking_by_token\(v_token_expired, '1900-01-01T00:00:00Z'\)/i);
    expect(smoke).toMatch(/Expected TOKEN_EXPIRED/i);
    expect(smoke).toMatch(/Expected BOOKING_ALREADY_CANCELLED/i);
    expect(smoke).toMatch(/Expected SLOT_CONFLICT/i);
    expect(smoke).toMatch(/reschedule_booking_by_token\(v_token_success, '1900-01-01T00:00:00Z', '2099-01-05T13:00:00Z'\)/i);
    expect(smoke).toMatch(/set_config\('request\.jwt\.claim\.role', 'service_role', true\)/i);
    expect(smoke).toMatch(/reschedule_admin_booking\(\s*booking_id\s*=>\s*v_admin_conflict_booking_id[\s\S]{0,220}branch_id\s*=>\s*v_branch_id/i);
    expect(smoke).toMatch(/Expected admin SLOT_CONFLICT/i);
    expect(smoke).toMatch(/Expected admin TURNO_INVALID_STATUS_TRANSITION/i);
    expect(smoke).toMatch(/reschedule_admin_booking\(\s*booking_id\s*=>\s*v_admin_success_booking_id[\s\S]{0,220}branch_id\s*=>\s*v_branch_id/i);
    expect(smoke).toMatch(/reschedule_canonical_availability_smoke' AS check_name, 'PASS' AS result/i);
  });

  it('hardens direct execute grants for helper and admin reschedule RPCs without breaking public token RPC grants', () => {
    const hardening = readRequiredFile(HARDENING_MIGRATION_PATH);

    expect(hardening).toMatch(/REVOKE ALL ON FUNCTION public\._load_manageable_booking\(text, timestamptz\) FROM PUBLIC/i);
    expect(hardening).toMatch(/REVOKE ALL ON FUNCTION public\._load_manageable_booking\(text, timestamptz\) FROM anon, authenticated/i);
    expect(hardening).toMatch(/REVOKE ALL ON FUNCTION public\.reschedule_admin_booking\(uuid, text, uuid, text, text\) FROM PUBLIC/i);
    expect(hardening).toMatch(/REVOKE ALL ON FUNCTION public\.reschedule_admin_booking\(uuid, text, text, text, text\) FROM PUBLIC/i);
    expect(hardening).toMatch(/GRANT EXECUTE ON FUNCTION public\.reschedule_admin_booking\(uuid, text, uuid, text, text\) TO authenticated, service_role/i);
    expect(hardening).toMatch(/GRANT EXECUTE ON FUNCTION public\.reschedule_admin_booking\(uuid, text, text, text, text\) TO authenticated, service_role/i);
    expect(hardening).toMatch(/GRANT EXECUTE ON FUNCTION public\.reschedule_booking_by_token\(text, text, text\) TO anon, authenticated/i);
    expect(hardening).toMatch(/GRANT EXECUTE ON FUNCTION public\.manage_booking_by_token\(text, text\) TO anon, authenticated/i);
    expect(hardening).toMatch(/GRANT EXECUTE ON FUNCTION public\.cancel_booking_by_token\(text, text\) TO anon, authenticated/i);
  });

  it('treats admin reschedule branch_id as a stale-context guard, not branch-level authorization', () => {
    const branchScope = readRequiredFile(BRANCH_SCOPE_MIGRATION_PATH);
    const branchGuardSemantics = readRequiredFile(BRANCH_GUARD_SEMANTICS_MIGRATION_PATH);
    const service = readRequiredFile(TURNO_SERVICE_PATH);
    const smoke = readRequiredFile(ROLLBACK_SMOKE_PATH);

    expect(branchGuardSemantics).toMatch(/business-level/i);
    expect(branchGuardSemantics).toMatch(/stale-context\/target consistency guard/i);
    expect(branchGuardSemantics).toMatch(/not a branch-level permission boundary/i);
    expect(branchScope).toMatch(/CREATE OR REPLACE FUNCTION public\.reschedule_admin_booking\(\s*booking_id uuid,\s*starts_at_iso text,\s*branch_id uuid,\s*performed_by uuid DEFAULT NULL/i);
    expect(branchScope).toMatch(/auth\.role\(\) <> 'service_role'[\s\S]{0,180}branch_id IS NULL[\s\S]{0,120}_raise_rpc\('ACTIVE_BRANCH_REQUIRED'\)/i);
    expect(branchScope).toMatch(/NOT public\.can_manage_business\(v_booking\.business_id\)[\s\S]{0,120}_raise_rpc\('UNAUTHORIZED'\)/i);
    expect(branchScope).toMatch(/branch_id IS NOT NULL[\s\S]{0,160}v_booking\.branch_id IS DISTINCT FROM reschedule_admin_booking\.branch_id[\s\S]{0,120}_raise_rpc\('UNAUTHORIZED'\)/i);
    expect(branchScope).toMatch(/CREATE OR REPLACE FUNCTION public\.reschedule_admin_booking\(\s*booking_id uuid,\s*starts_at_iso text,\s*performed_by uuid DEFAULT NULL/i);
    expect(branchScope).toMatch(/record_admin_booking_reschedule_failure\('rpc', 'ACTIVE_BRANCH_REQUIRED', 400, false\)/i);
    expect(branchScope).toMatch(/GRANT EXECUTE ON FUNCTION public\.reschedule_admin_booking\(uuid, text, uuid, uuid, text, text\) TO authenticated, service_role/i);
    expect(branchScope).toMatch(/REVOKE ALL ON FUNCTION public\.reschedule_admin_booking\(uuid, text, uuid, text, text\) FROM anon, authenticated/i);
    expect(branchScope).toMatch(/GRANT EXECUTE ON FUNCTION public\.reschedule_admin_booking\(uuid, text, uuid, text, text\) TO service_role/i);
    expect(service).toMatch(/rpc\('reschedule_admin_booking',[\s\S]{0,180}branch_id: branchScope\.branchId/i);
    expect(smoke).toMatch(/INSERT INTO auth\.users/i);
    expect(smoke).toMatch(/INSERT INTO public\.business_members/i);
    expect(smoke).toMatch(/Expected ACTIVE_BRANCH_REQUIRED for business-authorized branchless admin reschedule/i);
    expect(smoke).toMatch(/Expected UNAUTHORIZED for business-authorized stale-branch admin reschedule/i);
  });

  it('adds sanitized admin reschedule failure telemetry and centralizes durable app-side emission', () => {
    const branchScope = readRequiredFile(BRANCH_SCOPE_MIGRATION_PATH);
    const service = readRequiredFile(TURNO_SERVICE_PATH);
    const page = readRequiredFile(TURNOS_LIST_PAGE_PATH);
    const form = readRequiredFile(TURNO_FORM_PAGE_PATH);
    const telemetryTable = branchScope.match(/CREATE TABLE IF NOT EXISTS public\.admin_booking_reschedule_failure_events \([\s\S]*?\);/i)?.[0] ?? '';

    expect(branchScope).toMatch(/CREATE TABLE IF NOT EXISTS public\.admin_booking_reschedule_failure_events/i);
    expect(branchScope).toMatch(/feature text NOT NULL DEFAULT 'admin-booking-reschedule'/i);
    expect(branchScope).toMatch(/stage text NOT NULL CHECK \(stage IN \('rpc', 'ui'\)\)/i);
    expect(branchScope).toMatch(/code text NOT NULL CHECK \(code ~ '\^\[A-Z0-9_:-\]\{1,64\}\$'\)/i);
    expect(branchScope).toMatch(/status integer CHECK \(status BETWEEN 100 AND 599\)/i);
    expect(branchScope).toMatch(/retryable boolean NOT NULL DEFAULT true/i);
    expect(branchScope).toMatch(/REVOKE ALL ON TABLE public\.admin_booking_reschedule_failure_events FROM anon, authenticated/i);
    expect(telemetryTable).not.toMatch(/\b(?:message|error|stack|details|booking_id|branch_id|business_id)\b/i);
    expect(service).toMatch(/recordAdminRescheduleFailureTelemetry[\s\S]{0,520}record_admin_booking_reschedule_failure/i);
    expect(service).toMatch(/if \(response\.error\) \{[\s\S]{0,260}recordAdminRescheduleFailureTelemetry\(\{/i);
    expect(service).toMatch(/recordAdminRescheduleServiceFailureTelemetry\(error\)/i);
    expect(service).toMatch(/catch \(error\) \{[\s\S]{0,120}recordAdminRescheduleServiceFailureTelemetry\(error\)[\s\S]{0,80}throw error/i);
    expect(service).toMatch(/emitPublicBookingFailureEvent[\s\S]{0,260}ADMIN_RESCHEDULE_AUTH_REQUIRED[\s\S]{0,120}status:\s*401[\s\S]{0,120}retryable:\s*true/i);
    expect(service).toMatch(/isAdminRescheduleAuthRequiredFailure\(error, resolvedStatus\)[\s\S]{0,360}return;[\s\S]{0,220}recordAdminRescheduleFailureTelemetry\(\{/i);
    expect(service).toMatch(/stage:\s*'rpc'[\s\S]{0,160}adminRescheduleTelemetryCode\(error\)[\s\S]{0,220}status:\s*resolvedStatus[\s\S]{0,160}retryable:\s*false/i);
    expect(service).toMatch(/adminRescheduleServiceFailureStatus\(error: unknown\): number[\s\S]{0,260}TURNO_NOT_FOUND[\s\S]{0,260}AUTH_REQUIRED[\s\S]{0,260}INVALID_BRANCH/i);
    expect(page).toMatch(/buildAdminRescheduleFailurePresentation\(error\)/i);
    expect(page).not.toMatch(/recordAdminRescheduleFailureTelemetry\(\{[\s\S]{0,160}code: failure\.telemetryCode/i);
    expect(form).toMatch(/rescheduleByAdmin\(this\.turnoId\(\)!/i);
  });

  it('keeps admin reschedule AUTH_REQUIRED telemetry durable without an admin session while preserving normal admin telemetry', () => {
    const service = readRequiredFile(TURNO_SERVICE_PATH);

    expect(service).toMatch(/import \{ emitPublicBookingFailureEvent \} from '..\/..\/..\/core\/observability\/public-booking-operational-events'/i);
    expect(service).toMatch(/isAdminRescheduleAuthRequiredFailure\(error: unknown, status: number\): boolean[\s\S]{0,180}status === 401[\s\S]{0,120}AUTH_REQUIRED\|SUPABASE_UNAVAILABLE/i);
    expect(service).toMatch(/emitPublicBookingFailureEvent\(\{[\s\S]{0,120}stage:\s*'service'[\s\S]{0,120}code:\s*'ADMIN_RESCHEDULE_AUTH_REQUIRED'[\s\S]{0,120}status:\s*401[\s\S]{0,120}retryable:\s*true/i);
    expect(service).toMatch(/if \(this\.isAdminRescheduleAuthRequiredFailure\(error, resolvedStatus\)\) \{[\s\S]{0,360}return;[\s\S]{0,240}void this\.recordAdminRescheduleFailureTelemetry\(\{/i);
    expect(service).toMatch(/if \(response\.error\) \{[\s\S]{0,260}void this\.recordAdminRescheduleFailureTelemetry\(\{/i);
  });

  it('wires sanitized public manage/reschedule failure telemetry for availability and submit failures', () => {
    const managePage = readRequiredFile(MANAGE_BOOKING_PAGE_PATH);

    expect(managePage).toMatch(/emitPublicBookingFailureEvent/i);
    expect(managePage).toMatch(/stage:\s*'availability'[\s\S]{0,180}AVAILABILITY_LOOKUP_FAILED/i);
    expect(managePage).toMatch(/response\.error[\s\S]{0,260}stage:\s*'availability'/i);
    expect(managePage).toMatch(/stage:\s*'submit'[\s\S]{0,180}RESCHEDULE_SUBMIT_FAILED/i);
    expect(managePage).toMatch(/stage:\s*'service'[\s\S]{0,180}MANAGE_TOKEN_LOAD_FAILED/i);
    expect(managePage).toMatch(/retryable:\s*failureCode === 'BACKEND_UNAVAILABLE' \|\| !failureCode/i);
    expect(managePage).not.toMatch(/emitPublicBookingFailureEvent\([\s\S]{0,220}(token:\s*|bookingId|booking_id|businessSlug|serviceId)/i);
  });
});
