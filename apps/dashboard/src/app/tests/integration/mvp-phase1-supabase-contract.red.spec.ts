import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function findRepoRoot(startDir: string): string {
  let current = startDir;

  for (let depth = 0; depth < 6; depth += 1) {
    if (fs.existsSync(path.join(current, 'supabase')) && fs.existsSync(path.join(current, 'apps', 'dashboard'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error('Unable to locate Orvel repo root from test cwd');
}

const REPO_ROOT = findRepoRoot(process.cwd());
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');

function readSqlCorpus(): string {
  const sqlFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((entry) => entry.endsWith('.sql'))
    .sort();

  return sqlFiles.map((entry) => fs.readFileSync(path.join(MIGRATIONS_DIR, entry), 'utf8')).join('\n\n');
}

function functionBody(sql: string, functionName: string): string {
  const matches = [...sql.matchAll(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${functionName}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'gi')
  )];

  return matches.at(-1)?.[1] ?? '';
}

function functionBodies(sql: string, functionName: string): string[] {
  const matches = [...sql.matchAll(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${functionName}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'gi')
  )];

  return matches.map((match) => match[1] ?? '');
}

function functionSignature(sql: string, functionName: string): string {
  const matches = [...sql.matchAll(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${functionName}\\s*\\(([^)]*)\\)`, 'gi')
  )];

  return matches.at(-1)?.[1] ?? '';
}

describe('MVP phase 1 Supabase source-of-truth RED contracts', () => {
  it('M1 centralizes availability collision rules in RPCs for public, admin create, admin block, and reschedule flows', () => {
    const sql = readSqlCorpus();

    for (const functionName of [
      'query_public_slot_availability',
      'create_public_booking',
      'create_admin_manual_booking',
      'create_admin_blocked_time',
      'reschedule_admin_booking',
      'reschedule_booking_by_token'
    ]) {
      const body = functionBodies(sql, functionName).join('\n');
      const expectedHelper = functionName === 'query_public_slot_availability'
        ? /_query_booking_slot_availability\s*\(/i
        : /_assert_no_slot_conflict\s*\(/i;

      expect(body, `Missing RPC function body: ${functionName}`).not.toBe('');
      expect(body, `${functionName} must use the shared backend availability/collision helper`).toMatch(expectedHelper);
    }
  });

  it('M2 keeps MVP on a single default branch without requiring dashboard-supplied branch ids for admin bookings', () => {
    const sql = readSqlCorpus();
    const signature = functionSignature(sql, 'create_admin_manual_booking');
    const body = functionBody(sql, 'create_admin_manual_booking');

    expect(signature, 'create_admin_manual_booking must exist').not.toBe('');
    expect(signature, 'dashboard must not be forced to send branch_id during MVP phase 1').toMatch(/branch_id\s+uuid\s+default\s+null/i);
    expect(body, 'RPC must accept admin bookings without dashboard-supplied branch ids').toMatch(/_assert_no_slot_conflict\s*\([^)]*branch_id/i);
  });

  it('M3 exposes blocked-time creation only through an owner/service-role RPC with deterministic collision errors', () => {
    const sql = readSqlCorpus();
    const body = functionBody(sql, 'create_admin_blocked_time');

    expect(body, 'create_admin_blocked_time RPC must exist').not.toBe('');
    expect(body, 'blocked time RPC must validate owner or service role server-side').toMatch(/auth\.role\(\)[\s\S]*service_role|can_manage_business|is_business_owner/i);
    expect(body, 'blocked time RPC must reject appointment collisions').toMatch(/SLOT_CONFLICT|BLOCKED_TIME_COLLISION/i);
    expect(body, 'blocked time RPC must insert into public.blocked_times').toMatch(/insert\s+into\s+public\.blocked_times/i);
  });

  it('M5/M6 public manage links use RPC-only server-side validation and no unsafe public booking SELECT policy', () => {
    const sql = readSqlCorpus();
    const latestContract = fs.readFileSync(path.join(MIGRATIONS_DIR, '20260609030000_core_slice3_booking_canonical_contract.sql'), 'utf8');

    expect(latestContract, 'latest contract must remove unsafe direct public booking SELECT').toMatch(
      /drop\s+policy\s+if\s+exists\s+['"]Public\s+view\s+own\s+booking['"]\s+on\s+public\.bookings/i
    );

    for (const functionName of ['manage_booking_by_token', 'cancel_booking_by_token', 'reschedule_booking_by_token']) {
      const body = functionBody(sql, functionName);

      expect(body, `Missing public management RPC: ${functionName}`).not.toBe('');
      expect(body, `${functionName} must validate token/key server-side`).toMatch(/_load_manageable_booking|manage_token|management_key|token_hash/i);
      expect(body, `${functionName} must enforce expiry or policy-window checks server-side`).toMatch(/TOKEN_EXPIRED|POLICY_WINDOW_CLOSED|expires_at|cancellation/i);
    }
  });
});
