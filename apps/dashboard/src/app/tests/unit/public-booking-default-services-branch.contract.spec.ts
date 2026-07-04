import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_PATH = resolve(
  process.cwd(),
  '../../supabase/migrations/20260702110000_ensure_business_principal_branch_for_public_booking.sql',
);
const MIGRATION_SQL = readFileSync(MIGRATION_PATH, 'utf8');

function compact(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function expectSql(pattern: RegExp): void {
  expect(compact(MIGRATION_SQL)).toMatch(pattern);
}

describe('public booking default-service branch migration contract', () => {
  it('keeps the forward-only migration wired into the repository', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('creates a SECURITY DEFINER trigger that inserts an active principal branch for new businesses', () => {
    expectSql(/CREATE OR REPLACE FUNCTION public\.ensure_business_principal_branch\(\).*LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp/i);
    expectSql(/IF TG_OP = 'INSERT' THEN INSERT INTO public\.branches \(business_id, name, slug, timezone, is_active\) VALUES \( NEW\.id, COALESCE\(NULLIF\(btrim\(NEW\.name\), ''\), 'Sucursal principal'\), 'principal', COALESCE\(NULLIF\(btrim\(NEW\.timezone\), ''\), 'America\/Argentina\/Buenos_Aires'\), true \)/i);
    expectSql(/CREATE TRIGGER businesses_ensure_principal_branch AFTER INSERT OR UPDATE OF timezone ON public\.businesses FOR EACH ROW EXECUTE FUNCTION public\.ensure_business_principal_branch\(\)/i);
  });

  it('backfills only businesses with no branch rows, preserving inactive or non-principal branch state', () => {
    expectSql(/INSERT INTO public\.branches \(business_id, name, slug, timezone, is_active\) SELECT b\.id, COALESCE\(NULLIF\(btrim\(b\.name\), ''\), 'Sucursal principal'\), 'principal', COALESCE\(NULLIF\(btrim\(b\.timezone\), ''\), 'America\/Argentina\/Buenos_Aires'\), true FROM public\.businesses b WHERE NOT EXISTS \( SELECT 1 FROM public\.branches br WHERE br\.business_id = b\.id \)/i);
    expect(compact(MIGRATION_SQL)).not.toMatch(/WHERE br\.business_id = b\.id AND \(br\.slug = 'principal'|br\.is_active IS TRUE|br\.is_active = true\)/i);
  });

  it('does not reactivate an existing principal branch on insert/backfill conflicts', () => {
    const conflictUpdates = [...MIGRATION_SQL.matchAll(/ON CONFLICT \(business_id, slug\) WHERE slug IS NOT NULL DO UPDATE SET([\s\S]*?);/gi)];

    expect(conflictUpdates).toHaveLength(2);
    for (const [, updateClause] of conflictUpdates) {
      expect(compact(updateClause)).toMatch(/timezone = COALESCE\(public\.branches\.timezone, EXCLUDED\.timezone\)/i);
      expect(updateClause).not.toMatch(/\bis_active\s*=/i);
    }
  });

  it('keeps timezone updates scoped to the principal branch without creating new branch rows', () => {
    const updateBranch = MIGRATION_SQL.match(/ELSIF TG_OP = 'UPDATE' THEN([\s\S]*?)END IF;/i)?.[1] ?? '';

    expect(compact(updateBranch)).toMatch(/UPDATE public\.branches SET timezone = COALESCE\(NULLIF\(btrim\(public\.branches\.timezone\), ''\), COALESCE\(NULLIF\(btrim\(NEW\.timezone\), ''\), 'America\/Argentina\/Buenos_Aires'\)\), updated_at = now\(\) WHERE business_id = NEW\.id AND slug = 'principal'/i);
    expect(updateBranch).not.toMatch(/INSERT INTO public\.branches/i);
  });
});
