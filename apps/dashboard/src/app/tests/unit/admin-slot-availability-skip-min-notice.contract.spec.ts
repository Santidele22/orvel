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
const ADMIN_SKIP_MIN_NOTICE_MIGRATION = '20260825184500_admin_slot_availability_skip_min_notice.sql';

function functionBody(sql: string, functionName: string): string {
  const matches = [...sql.matchAll(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${functionName}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'gi')
  )];

  return matches.at(-1)?.[1] ?? '';
}

describe('admin slot availability skips public min-notice', () => {
  it('replaces query_admin_slot_availability with p_enforce_min_notice false', () => {
    const migrationPath = path.join(MIGRATIONS_DIR, ADMIN_SKIP_MIN_NOTICE_MIGRATION);
    expect(existsSync(migrationPath), `missing ${ADMIN_SKIP_MIN_NOTICE_MIGRATION}`).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    const body = functionBody(sql, 'query_admin_slot_availability');

    expect(body, 'new migration must redefine query_admin_slot_availability').not.toBe('');
    expect(body).toMatch(/can_manage_business\s*\(/i);
    expect(body).toMatch(/_query_booking_slot_availability\s*\([\s\S]*?,\s*false\s*\)/);
    expect(body).not.toMatch(/_query_booking_slot_availability\s*\([\s\S]*?,\s*true\s*\)/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.query_admin_slot_availability/i);
    expect(sql).toMatch(/NOTIFY pgrst/i);
    expect(sql).not.toMatch(/query_public_slot_availability/i);
  });

  it('keeps the latest public availability RPC enforcing min-notice', () => {
    const sql = readdirSync(MIGRATIONS_DIR)
      .filter((entry) => entry.endsWith('.sql'))
      .sort()
      .map((entry) => readFileSync(path.join(MIGRATIONS_DIR, entry), 'utf8'))
      .join('\n\n');
    const body = functionBody(sql, 'query_public_slot_availability');

    expect(body, 'query_public_slot_availability must still exist').not.toBe('');
    expect(body).toMatch(/_query_booking_slot_availability\s*\([\s\S]*?,\s*true\s*\)/);
  });
});
