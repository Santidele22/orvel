import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function findRepoRoot(startDir: string): string {
  let current = startDir;

  for (let depth = 0; depth < 8; depth += 1) {
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
const BOOKING_GATEWAY_FILE = path.join(
  REPO_ROOT,
  'apps',
  'dashboard',
  'src',
  'app',
  'core',
  'api',
  'supabase-booking.gateway.ts'
);

function readSqlCorpus(): string {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .map((entry) => `\n-- file: ${entry}\n${fs.readFileSync(path.join(MIGRATIONS_DIR, entry), 'utf8')}`)
    .join('\n\n');
}

function readBookingContractMigrations(): string {
  return ['20260609030000_core_slice3_booking_canonical_contract.sql']
    .map((entry) => `\n-- file: ${entry}\n${fs.readFileSync(path.join(MIGRATIONS_DIR, entry), 'utf8')}`)
    .join('\n\n');
}

function stripComments(sql: string): string {
  return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function latestFunctionBody(sql: string, functionName: string): string {
  const matches = [...sql.matchAll(new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${functionName}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    'gi'
  ))];

  return matches.at(-1)?.[1] ?? '';
}

function allFunctionBodies(sql: string, functionName: string): string[] {
  return [...sql.matchAll(new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${functionName}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    'gi'
  ))].map((match) => match[1] ?? '');
}

function functionExists(sql: string, functionName: string): boolean {
  return new RegExp(`create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${functionName}\\s*\\(`, 'i').test(sql);
}

const CANONICAL_BOOKING_STATUSES = ['confirmed', 'cancelled', 'completed', 'no_show'] as const;

const REQUIRED_RPCS = [
  'query_public_slot_availability',
  'create_public_booking',
  'create_admin_manual_booking',
  'create_admin_blocked_time',
  'update_admin_booking',
  'cancel_admin_booking',
  'reschedule_admin_booking',
  'update_booking_status',
  'manage_booking_by_token',
  'cancel_booking_by_token',
  'reschedule_booking_by_token'
] as const;

const COLLISION_RPCS = [
  'query_public_slot_availability',
  'create_public_booking',
  'create_admin_manual_booking',
  'create_admin_blocked_time',
  'reschedule_admin_booking',
  'reschedule_booking_by_token'
] as const;

describe('Core Slice 3 backend booking canonical contract RED tests', () => {
  it('keeps public manage tokens private: raw token may be returned once, but storage/lookup uses a revocable hash contract', () => {
    const sql = stripComments(readBookingContractMigrations());
    const createPublicBooking = latestFunctionBody(sql, 'create_public_booking');

    expect(sql, 'canonical schema must contain a hash column/index for public management keys').toMatch(
      /\b(manage_token_hash|management_key_hash|token_hash)\b/i
    );
    expect(sql, 'canonical schema must contain an expiry/revocation column for public management keys').toMatch(
      /\b(manage_token_expires_at|management_key_expires_at|revoked_at)\b/i
    );
    expect(createPublicBooking, 'create_public_booking must return the raw manage token/key exactly once to the client').toMatch(
      /jsonb_build_object[\s\S]*'(manage_token|management_key)'/i
    );

    expect(sql, 'canonical contract must not index raw manage_token as the lookup key').not.toMatch(
      /create\s+(?:unique\s+)?index[\s\S]*?on\s+public\.bookings\s*\([^)]*\bmanage_token\b/i
    );
    expect(sql, 'canonical contract must not store generated raw manage_token in public.bookings').not.toMatch(
      /insert\s+into\s+public\.bookings\s*\([^)]*\bmanage_token\b/i
    );
    expect(sql, 'public management RPCs must not authenticate by direct raw manage_token SELECT').not.toMatch(
      /where\s+[^;]*\bmanage_token\b\s*=\s*(?:token|p_token|management_key|p_management_key)\b/i
    );
  });

  it('uses one explicit canonical booking status vocabulary across checks, inserts, indexes, and RPC filters', () => {
    const sql = stripComments(readBookingContractMigrations());
    const allowedStatusCheck = new RegExp(
      `check\\s*\\(\\s*status\\s+in\\s*\\(\\s*${CANONICAL_BOOKING_STATUSES.map((status) => `'${status}'`).join('\\s*,\\s*')}\\s*\\)\\s*\\)`,
      'i'
    );

    expect(sql, 'bookings_status_check must encode the MVP canonical statuses exactly').toMatch(allowedStatusCheck);
    expect(sql, 'legacy booked rows must be mapped explicitly to canonical confirmed before enforcing the constraint').toMatch(
      /when\s+status\s*=\s*'booked'\s+then\s+'confirmed'/i
    );
    expect(sql, 'legacy rejected rows must be mapped explicitly out of the canonical active vocabulary before enforcing the constraint').toMatch(
      /when\s+status\s*=\s*'rejected'\s+then\s+'cancelled'/i
    );

    for (const functionName of REQUIRED_RPCS) {
      const body = latestFunctionBody(sql, functionName);
      expect(body, `${functionName} must not leak legacy booked/rejected status names`).not.toMatch(/'booked'|'rejected'/i);
    }
  });

  it('centralizes availability/collision decisions in one backend helper used by create, reschedule, block, and query flows', () => {
    const sql = stripComments(readSqlCorpus());
    const availabilityHelperMatch = sql.match(
      /create\s+or\s+replace\s+function\s+(?:public\.)?(_query_booking_slot_availability|query_canonical_slot_availability)\s*\(/i
    );
    const collisionHelperMatch = sql.match(
      /create\s+or\s+replace\s+function\s+(?:public\.)?(_assert_no_slot_conflict|assert_booking_slot_available|ensure_booking_slot_available|check_booking_slot_available)\s*\(/i
    );

    expect(availabilityHelperMatch?.[1], 'missing shared booking availability helper').toBeDefined();
    expect(collisionHelperMatch?.[1], 'missing shared booking collision helper').toBeDefined();

    const availabilityHelperName = availabilityHelperMatch?.[1] ?? '__missing_booking_availability_helper__';
    const collisionHelperName = collisionHelperMatch?.[1] ?? '__missing_booking_collision_helper__';

    for (const functionName of COLLISION_RPCS) {
      const bodies = allFunctionBodies(sql, functionName);
      const body = bodies.join('\n');
      expect(body, `Missing RPC function body: ${functionName}`).not.toBe('');
      const expectedHelperName = functionName === 'query_public_slot_availability'
        ? availabilityHelperName
        : collisionHelperName;
      expect(body, `${functionName} must call the shared backend availability/collision helper`).toMatch(
        new RegExp(`\\b${expectedHelperName}\\s*\\(`, 'i')
      );
    }
  });

  it('exposes all M1-M6 booking RPCs with deterministic backend error codes', () => {
    const sql = stripComments(readSqlCorpus());
    const deterministicErrorCodes = [
      'BUSINESS_NOT_FOUND',
      'BOOKING_VALIDATION_ERROR',
      'INVALID_SERVICE',
      'INVALID_BOOKING',
      'INVALID_TOKEN',
      'TOKEN_EXPIRED',
      'POLICY_WINDOW_CLOSED',
      'SLOT_CONFLICT',
      'BLOCKED_TIME_COLLISION',
      'UNAUTHORIZED',
      'FORBIDDEN'
    ];

    for (const functionName of REQUIRED_RPCS) {
      const bodies = allFunctionBodies(sql, functionName);
      const body = bodies.join('\n');

      expect(functionExists(sql, functionName), `Missing required M1-M6 RPC: ${functionName}`).toBe(true);
      expect(body, `${functionName} must raise explicit string error codes instead of silent/implicit failures`).toMatch(
        new RegExp(`(?:raise\\s+exception|(?:\\b\\w+\\.)?_raise_rpc\\s*\\()\\s*'(?:${deterministicErrorCodes.join('|')})'`, 'i')
      );
    }
  });

  it('requires public manage/cancel/reschedule surfaces to use RPCs and map canonical token/window/conflict errors deterministically', () => {
    const gatewaySource = fs.readFileSync(BOOKING_GATEWAY_FILE, 'utf8');

    expect(gatewaySource, 'frontend/core must not query public.bookings directly for manage-link flows').not.toMatch(
      /\.from\(\s*['"]bookings['"]\s*\)[\s\S]{0,300}\.select\(/i
    );

    for (const rpcName of ['manage_booking_by_token', 'cancel_booking_by_token', 'reschedule_booking_by_token']) {
      expect(gatewaySource, `gateway must call ${rpcName} RPC`).toMatch(new RegExp(`\\.rpc\\(\\s*['"]${rpcName}['"]`, 'i'));
    }

    for (const code of ['INVALID_TOKEN', 'TOKEN_EXPIRED', 'POLICY_WINDOW_CLOSED', 'SLOT_CONFLICT']) {
      expect(gatewaySource, `gateway must expose deterministic mapping for ${code}`).toContain(code);
    }
  });
});
