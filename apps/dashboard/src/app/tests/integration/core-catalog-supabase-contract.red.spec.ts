import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DASHBOARD_ROOT = process.cwd();
const MONOREPO_ROOT = path.resolve(DASHBOARD_ROOT, '..', '..');

const MIGRATION_DIRS = [
  path.join(MONOREPO_ROOT, 'supabase', 'migrations'),
  path.join(DASHBOARD_ROOT, 'supabase', 'migrations')
];

function readSqlCorpus(): string {
  const files = MIGRATION_DIRS.flatMap((dir) => {
    if (!fs.existsSync(dir)) {
      return [];
    }

    return fs
      .readdirSync(dir)
      .filter((entry) => entry.endsWith('.sql'))
      .sort()
      .map((entry) => path.join(dir, entry));
  });

  expect(files.length, 'Missing checked-in Supabase migrations for catalog contract checks').toBeGreaterThan(0);

  return files.map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n\n');
}

function extractFunction(sql: string, functionName: string): string {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${functionName}\\s*\\([\\s\\S]*?(?=\\n\\s*(?:create|alter|grant|revoke|insert|do|--|$))`,
    'i'
  );

  return sql.match(pattern)?.[0] ?? '';
}

describe('RED contract: Supabase dashboard reference catalog source of truth', () => {
  it('defines DB-owned plan catalog, aliases, business types, and plan/business-type mapping', () => {
    const sql = readSqlCorpus();

    expect(sql, 'public.plans must own entitlement columns so plans are not hardcoded in clients').toMatch(
      /(?:create\s+table[\s\S]+public\.plans[\s\S]+max_locales[\s\S]+max_rubros[\s\S]+max_monthly_bookings[\s\S]+ai_credits_monthly|alter\s+table\s+(?:public\.)?plans[\s\S]+add\s+column[\s\S]+max_locales[\s\S]+add\s+column[\s\S]+max_rubros[\s\S]+add\s+column[\s\S]+max_monthly_bookings[\s\S]+add\s+column[\s\S]+ai_credits_monthly)/i
    );

    expect(sql, 'Missing public.plan_aliases for DB-driven legacy/case-insensitive plan aliases').toMatch(
      /create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?plan_aliases\b/i
    );
    expect(sql, 'Missing public.business_types dashboard catalog table').toMatch(
      /create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?business_types\b/i
    );
    expect(sql, 'business_types must expose stable code + user-facing label').toMatch(
      /business_types[\s\S]+\bcode\s+text[\s\S]+\blabel\s+text/i
    );
    expect(sql, 'Missing public.business_type_aliases for DB-driven rubro/business-type aliases').toMatch(
      /create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?business_type_aliases\b/i
    );
    expect(sql, 'Missing public.plan_business_types join table for allowed business types per plan').toMatch(
      /create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?plan_business_types\b/i
    );
  });

  it('exposes get_dashboard_reference_catalog() RPC with plans, aliases, business types, and mappings', () => {
    const sql = readSqlCorpus();
    const rpc = extractFunction(sql, 'get_dashboard_reference_catalog');

    expect(rpc, 'Missing public.get_dashboard_reference_catalog() RPC').toMatch(
      /create\s+or\s+replace\s+function\s+(?:public\.)?get_dashboard_reference_catalog\s*\(\s*\)/i
    );
    expect(rpc, 'Catalog RPC must return JSON/object payload for a single frontend fetch').toMatch(/returns\s+jsonb?/i);
    expect(rpc, 'Catalog RPC must include plans').toMatch(/\bplans\b/i);
    expect(rpc, 'Catalog RPC must include plan_aliases').toMatch(/\bplan_aliases\b/i);
    expect(rpc, 'Catalog RPC must include business_types').toMatch(/\bbusiness_types\b/i);
    expect(rpc, 'Catalog RPC must include business_type_aliases').toMatch(/\bbusiness_type_aliases\b/i);
    expect(rpc, 'Catalog RPC must include plan_business_types').toMatch(/\bplan_business_types\b/i);
  });

  it('keeps business entitlement snapshots DB-driven instead of hardcoded CASE matrices', () => {
    const sql = readSqlCorpus();
    const snapshotRpc = extractFunction(sql, 'get_business_entitlements_snapshot');

    expect(snapshotRpc, 'Missing public.get_business_entitlements_snapshot RPC').toMatch(
      /create\s+or\s+replace\s+function\s+(?:public\.)?get_business_entitlements_snapshot\s*\(/i
    );
    expect(snapshotRpc, 'Entitlement snapshots must join DB plan data, not duplicate a CASE plan matrix').toMatch(
      /join\s+(?:public\.)?plans\b/i
    );
    expect(snapshotRpc, 'Remove hardcoded CASE-by-plan entitlement matrices from snapshot RPC').not.toMatch(
      /case\s+[^;]*plan_code[\s\S]*?when\s+['"]?(FREE|BASIC|MEDIUM|STARTER|GROWTH|PRO)['"]?/i
    );
  });
});
