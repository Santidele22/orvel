import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function findRepoRoot(startDir: string): string {
  let current = startDir;

  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(current, 'supabase')) && existsSync(resolve(current, 'apps/dashboard'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return startDir;
}

const REPO_ROOT = findRepoRoot(process.cwd());

const MIGRATION_PATH = resolve(
  REPO_ROOT,
  'supabase/migrations/_legacy/20260627210000_enforce_public_booking_canonical_availability.sql'
);

function readMigration(): string {
  expect(existsSync(MIGRATION_PATH), 'Missing forward-only public booking availability enforcement migration').toBe(true);
  return readFileSync(MIGRATION_PATH, 'utf-8');
}

function stripComments(sql: string): string {
  return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function publicCreateBody(sql: string): string {
  const match = stripComments(sql).match(
    /create\s+or\s+replace\s+function\s+public\.create_public_booking\s*\(\s*business_slug\s+text[\s\S]*?language\s+plpgsql[\s\S]*?\$\$([\s\S]*?)\$\$/i
  );

  return match?.[1] ?? '';
}

function canonicalAvailabilityQuery(body: string): string {
  const match = body.match(
    /SELECT\s+count\(\*\)\s+INTO\s+v_matching_slot_count\s+FROM\s+public\._query_booking_slot_availability\s*\(([\s\S]*?)\)\s+AS\s+availability\s+WHERE([\s\S]*?);/i
  );

  return match ? `${match[1]} ${match[2]}` : '';
}

describe('public booking backend availability enforcement', () => {
  it('adds a full-timestamp forward-only migration for canonical create enforcement', () => {
    // Arrange / Act
    const migration = readMigration();

    // Assert
    expect(MIGRATION_PATH).toMatch(/\/supabase\/migrations\/\d{14}_enforce_public_booking_canonical_availability\.sql$/);
    expect(migration).toMatch(/BEGIN;/i);
    expect(migration).toMatch(/COMMIT;/i);
  });

  it('makes create_public_booking reuse canonical slot availability before inserting', () => {
    // Arrange
    const body = publicCreateBody(readMigration());
    const availabilityCheckIndex = body.search(/_query_booking_slot_availability\s*\(/i);
    const insertIndex = body.search(/insert\s+into\s+public\.bookings/i);

    // Assert
    expect(body, 'Missing plpgsql create_public_booking body in enforcement migration').not.toBe('');
    expect(availabilityCheckIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(-1);
    expect(availabilityCheckIndex).toBeLessThan(insertIndex);
  });

  it('rejects non-working, stale, blocked, or full direct create slots with the canonical unavailable-slot error', () => {
    // Arrange
    const body = publicCreateBody(readMigration());
    const rejectionBeforeInsert = body.slice(0, body.search(/insert\s+into\s+public\.bookings/i));

    // Assert
    expect(rejectionBeforeInsert).toMatch(/remaining_capacity\s*>\s*0/i);
    expect(rejectionBeforeInsert).toMatch(/v_matching_slot_count\s*<\s*1[\s\S]*_raise_rpc\s*\(\s*'SLOT_CONFLICT'\s*\)/i);
    expect(rejectionBeforeInsert).toMatch(/v_starts_at\s+AT\s+TIME\s+ZONE\s+COALESCE\(v_timezone,\s*'UTC'\)/i);
  });

  it('passes create inputs into canonical availability and gates every write behind that result', () => {
    // Arrange
    const body = publicCreateBody(readMigration());
    const availabilityQuery = canonicalAvailabilityQuery(body);
    const rejectionIndex = body.search(/v_matching_slot_count\s*<\s*1[\s\S]*_raise_rpc\s*\(\s*'SLOT_CONFLICT'\s*\)/i);
    const lockIndex = body.search(/_lock_booking_conflict_window\s*\(/i);
    const conflictIndex = body.search(/_assert_no_slot_conflict\s*\(/i);
    const customerInsertIndex = body.search(/insert\s+into\s+public\.customers/i);
    const bookingInsertIndex = body.search(/insert\s+into\s+public\.bookings/i);

    // Assert
    expect(availabilityQuery, 'Missing canonical availability query used by create_public_booking').not.toBe('');
    expect(availabilityQuery).toMatch(/v_business_id/i);
    expect(availabilityQuery).toMatch(/v_service_id/i);
    expect(availabilityQuery).toMatch(/v_availability_date/i);
    expect(availabilityQuery).toMatch(/v_branch_id/i);
    expect(availabilityQuery).toMatch(/true/i);
    expect(availabilityQuery).toMatch(/availability\.starts_at_iso::timestamptz\s*=\s*v_starts_at/i);
    expect(availabilityQuery).toMatch(/availability\.remaining_capacity\s*>\s*0/i);
    expect(rejectionIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeGreaterThan(rejectionIndex);
    expect(conflictIndex).toBeGreaterThan(rejectionIndex);
    expect(customerInsertIndex).toBeGreaterThan(rejectionIndex);
    expect(bookingInsertIndex).toBeGreaterThan(rejectionIndex);
  });

  it('documents a rollback-safe manual linked verification path for reviewers without local DB', () => {
    // Arrange
    const runbookPath = resolve(REPO_ROOT, 'docs/runbooks/supabase-migrations.md');
    const runbook = readFileSync(runbookPath, 'utf-8');

    // Assert
    expect(runbook).toMatch(/create_public_booking canonical availability enforcement/i);
    expect(runbook).toMatch(/supabase db query --linked/i);
    expect(runbook).toMatch(/BEGIN;[\s\S]*ROLLBACK;/i);
    expect(runbook).toMatch(/SLOT_CONFLICT/i);
    expect(runbook).toMatch(/restore the previous create_public_booking definition/i);
  });

  it('preserves security-definer, search_path, hash-only management bearer, overload, and grants', () => {
    // Arrange
    const migration = readMigration();
    const body = publicCreateBody(migration);

    // Assert
    expect(migration).toMatch(/security\s+definer[\s\S]*set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
    expect(body).toMatch(/extensions\.gen_random_bytes\(32\)/i);
    expect(body).toMatch(/public\._hash_manage_token\(v_management_bearer\)/i);
    expect(body).not.toMatch(/\bmanage_token\s*,/i);
    expect(migration).toMatch(/create\s+or\s+replace\s+function\s+public\.create_public_booking\s*\([\s\S]*professional_id\s+text\s+default\s+null\s*\)[\s\S]*select\s+public\.create_public_booking\(business_slug,\s*service_id,\s*starts_at_iso,\s*client,\s*notes,\s*professional_id,\s*NULL::text\)/i);
    expect(migration).toMatch(/grant\s+execute\s+on\s+function\s+public\.create_public_booking\(text,\s*text,\s*text,\s*jsonb,\s*text,\s*text,\s*text\)\s+to\s+anon,\s*authenticated/i);
  });
});
