import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function findRepoRoot(startDir: string): string {
  let current = startDir;

  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(path.join(current, 'supabase')) && existsSync(path.join(current, 'apps', 'dashboard'))) {
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
const MERGE_DEFAULT_HOURS_MIGRATION = '20260825233000_slot_availability_merge_default_working_hours.sql';

function functionBody(sql: string, functionName: string): string {
  const matches = [...sql.matchAll(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${functionName}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'gi')
  )];

  return matches.at(-1)?.[1] ?? '';
}

function latestFunctionBody(functionName: string): string {
  const sql = readdirSync(MIGRATIONS_DIR)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .map((entry) => readFileSync(path.join(MIGRATIONS_DIR, entry), 'utf8'))
    .join('\n\n');

  return functionBody(sql, functionName);
}

describe('slot availability merges default working hours', () => {
  it('replaces _query_booking_slot_availability with jsonb default || stored hours', () => {
    const migrationPath = path.join(MIGRATIONS_DIR, MERGE_DEFAULT_HOURS_MIGRATION);
    expect(existsSync(migrationPath), `missing ${MERGE_DEFAULT_HOURS_MIGRATION}`).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    const body = functionBody(sql, '_query_booking_slot_availability');

    expect(body, 'new migration must redefine _query_booking_slot_availability').not.toBe('');
    expect(body).toMatch(/\|\|\s*COALESCE\s*\(\s*bs\.working_hours\s*,\s*'\{\}'::jsonb\s*\)/i);
    expect(body).toMatch(/"wednesday"\s*:\s*\{[^}]*"enabled"\s*:\s*true/i);
    expect(body.indexOf('||')).toBeLessThan(body.search(/v_working_hours\s*->\s*v_day_key/i));
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\._query_booking_slot_availability/i);
    expect(sql).toMatch(/NOTIFY pgrst/i);
  });

  it('keeps the latest helper merging defaults before the weekday lookup', () => {
    const body = latestFunctionBody('_query_booking_slot_availability');

    expect(body, '_query_booking_slot_availability must still exist').not.toBe('');
    expect(body).toMatch(/\|\|\s*COALESCE\s*\(\s*bs\.working_hours\s*,\s*'\{\}'::jsonb\s*\)/i);
    expect(body).toMatch(/"wednesday"\s*:\s*\{[^}]*"enabled"\s*:\s*true/i);
    expect(body.indexOf('||')).toBeLessThan(body.search(/v_working_hours\s*->\s*v_day_key/i));
  });

  it('keeps admin skip-min-notice and public min-notice as already shipped', () => {
    const adminBody = latestFunctionBody('query_admin_slot_availability');
    const publicBody = latestFunctionBody('query_public_slot_availability');

    expect(adminBody).toMatch(/_query_booking_slot_availability\s*\([\s\S]*?,\s*false\s*\)/);
    expect(publicBody).toMatch(/_query_booking_slot_availability\s*\([\s\S]*?,\s*true\s*\)/);
  });
});
