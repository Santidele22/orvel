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

const REPO_ROOT = findRepoRoot(ROOT);
const MIGRATION_PATHS = [
  path.join(REPO_ROOT, 'supabase/migrations/_legacy/20260629190000_harden_public_services_rls.sql'),
  path.join(REPO_ROOT, 'supabase/migrations/_legacy/20260629191000_drop_legacy_broad_public_services_policies.sql')
];
const SMOKE_PATH = path.join(REPO_ROOT, 'supabase/checks/20260629190000_public_services_rls_smoke.sql');

function readRequiredFile(filePath: string): string {
  expect(fs.existsSync(filePath), `Missing required file: ${filePath}`).toBe(true);
  return fs.readFileSync(filePath, 'utf8');
}

function readServiceRlsMigrations(): string {
  return MIGRATION_PATHS.map(readRequiredFile).join('\n');
}

describe('public services RLS contract', () => {
  it('replaces broad public service reads with active-only public visibility', () => {
    const migration = readServiceRlsMigrations();

    expect(migration).toMatch(/DROP POLICY IF EXISTS "Public view services" ON public\.services/i);
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Public can view services" ON public\.services/i);
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Services are viewable by everyone" ON public\.services/i);
    expect(migration).toMatch(/CREATE POLICY "Public view active services"[\s\S]*FOR SELECT[\s\S]*TO anon, authenticated[\s\S]*USING \(COALESCE\(is_active, true\) = true\)/i);
    expect(migration).not.toMatch(/ON public\.services[\s\S]{0,120}FOR SELECT[\s\S]{0,120}USING \(true\)/i);
  });

  it('preserves authenticated business-manager service CRUD through can_manage_business', () => {
    const migration = readServiceRlsMigrations();

    expect(migration).toMatch(/CREATE POLICY "Business managers manage services"[\s\S]*FOR ALL[\s\S]*TO authenticated/i);
    expect(migration).toMatch(/USING \(public\.can_manage_business\(business_id\)\)/i);
    expect(migration).toMatch(/WITH CHECK \(public\.can_manage_business\(business_id\)\)/i);
  });

  it('documents a rollback-safe smoke proving anon active-only reads', () => {
    const smoke = readRequiredFile(SMOKE_PATH);

    expect(smoke).toMatch(/BEGIN;/i);
    expect(smoke).toMatch(/ROLLBACK;/i);
    expect(smoke).toMatch(/set_config\('request\.jwt\.claim\.role', 'anon'/i);
    expect(smoke).toMatch(/Expected anon to read active public service/i);
    expect(smoke).toMatch(/Expected anon to be unable to read inactive public service/i);
  });
});
