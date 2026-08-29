import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function findRepoRoot(start: string): string {
  let current = start;

  while (current !== path.dirname(current)) {
    if (
      fs.existsSync(path.join(current, 'supabase', 'checks')) &&
      fs.existsSync(path.join(current, 'apps', 'dashboard'))
    ) {
      return current;
    }

    current = path.dirname(current);
  }

  return start;
}

const LOCKED_TABLES = [
  'professionals',
  'professional_services',
  'users',
  'professional_hours',
  'service_categories',
  'clients',
  'appointments',
  'notifications',
  'email_outbox'
] as const;

const REPO_ROOT = findRepoRoot(ROOT);
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  'supabase/migrations/20260828200000_enable_rls_on_20260729_public_tables.sql'
);
const SMOKE_PATH = path.join(
  REPO_ROOT,
  'supabase/checks/20260828200000_enable_rls_on_20260729_public_tables_smoke.sql'
);

function readRequiredFile(filePath: string): string {
  expect(fs.existsSync(filePath), `Missing required file: ${filePath}`).toBe(true);
  return fs.readFileSync(filePath, 'utf8');
}

describe('20260729 public tables RLS contract', () => {
  it('enables RLS on every 20260729 public table created without it', () => {
    const migration = readRequiredFile(MIGRATION_PATH);

    for (const table of LOCKED_TABLES) {
      expect(migration).toMatch(
        new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i')
      );
    }
  });

  it('does not create policies or USING (true) on the locked tables', () => {
    const migration = readRequiredFile(MIGRATION_PATH);

    expect(migration).not.toMatch(/CREATE POLICY/i);
    expect(migration).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });

  it('documents a rollback-safe smoke proving anon cannot read the locked tables', () => {
    const smoke = readRequiredFile(SMOKE_PATH);

    expect(smoke).toMatch(/BEGIN;/i);
    expect(smoke).toMatch(/ROLLBACK;/i);
    expect(smoke).toMatch(/SET LOCAL ROLE anon/i);
    expect(smoke).toMatch(/password_hash/i);
    expect(smoke).toMatch(/Expected anon to be unable to read/i);

    for (const table of LOCKED_TABLES) {
      expect(smoke).toMatch(new RegExp(`public\\.${table}`, 'i'));
    }
  });
});
