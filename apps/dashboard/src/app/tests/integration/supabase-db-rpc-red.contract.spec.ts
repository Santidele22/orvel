import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPO_ROOT = path.resolve(ROOT, '..', '..');
const SUPABASE_DIR = path.join(ROOT, 'supabase');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');

const REQUIRED_TABLE_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'businesses table',
    pattern: /create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?businesses\b/i
  },
  {
    name: 'customers table',
    pattern: /create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?customers\b/i
  },
  {
    name: 'bookings table',
    pattern: /create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?bookings\b/i
  },
  {
    name: 'blocked_times table',
    pattern: /create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?blocked_times\b/i
  }
];

const REQUIRED_TABLE_COLUMNS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'business slug uniqueness contract',
    pattern: /(?:businesses[\s\S]*?slug[\s\S]*?unique|unique\s*\(\s*slug\s*\))/i
  },
  {
    name: 'booking management token contract',
    pattern: /bookings[\s\S]*?(manage_token|management_token)/i
  },
  {
    name: 'bookings starts_at contract',
    pattern: /bookings[\s\S]*?starts_at/i
  },
  {
    name: 'blocked_times window contract',
    pattern: /blocked_times[\s\S]*?starts_at[\s\S]*?ends_at/i
  }
];

const REQUIRED_RPC_SIGNATURES: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'resolve_business_by_slug(business_slug text)',
    pattern:
      /create\s+or\s+replace\s+function\s+(?:public\.)?resolve_business_by_slug\s*\((?=[^)]*\bbusiness_slug\s+text\b)[^)]*\)/i
  },
  {
    name: 'create_public_booking(...) required args',
    pattern:
      /create\s+or\s+replace\s+function\s+(?:public\.)?create_public_booking\s*\((?=[^)]*\bbusiness_slug\s+text\b)(?=[^)]*\bservice_id\s+text\b)(?=[^)]*\bstarts_at_iso\s+(?:text|timestamptz)\b)(?=[^)]*\bclient\s+jsonb\b)[^)]*\)/i
  },
  {
    name: 'manage_booking_by_token(token text, now_iso ...)',
    pattern:
      /create\s+or\s+replace\s+function\s+(?:public\.)?manage_booking_by_token\s*\((?=[^)]*\btoken\s+text\b)(?=[^)]*\bnow_iso\s+(?:text|timestamptz)\b)[^)]*\)/i
  },
  {
    name: 'create_admin_manual_booking(...) required args',
    pattern:
      /create\s+or\s+replace\s+function\s+(?:public\.)?create_admin_manual_booking\s*\((?=[^)]*\bbusiness_id\s+(?:uuid|text)\b)(?=[^)]*\bservice_id\s+text\b)(?=[^)]*\bstarts_at_iso\s+(?:text|timestamptz)\b)(?=[^)]*\bduration_minutes\s+integer\b)(?=[^)]*\bprofessional_id\s+(?:uuid|text)\b)(?=[^)]*\bperformed_by\s+(?:uuid|text)\b)[^)]*\)/i
  },
  {
    name: 'create_admin_blocked_time(...) required args',
    pattern:
      /create\s+or\s+replace\s+function\s+(?:public\.)?create_admin_blocked_time\s*\((?=[^)]*\bbusiness_id\s+(?:uuid|text)\b)(?=[^)]*\bstarts_at_iso\s+(?:text|timestamptz)\b)(?=[^)]*\bends_at_iso\s+(?:text|timestamptz)\b)(?=[^)]*\breason\s+text\b)(?=[^)]*\bperformed_by\s+(?:uuid|text)\b)[^)]*\)/i
  }
];

const REQUIRED_ERROR_CODES = [
  'BUSINESS_NOT_FOUND',
  'BOOKING_VALIDATION_ERROR',
  'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN',
  'INVALID_TOKEN',
  'TOKEN_EXPIRED',
  'POLICY_WINDOW_CLOSED',
  'SLOT_CONFLICT',
  'BLOCKED_TIME_COLLISION'
];

function readSqlFilesRecursive(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const sqlFiles: string[] = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && fullPath.endsWith('.sql')) {
        sqlFiles.push(fullPath);
      }
    }
  }

  return sqlFiles.sort();
}

function readActiveSqlFiles(dirPath: string): string[] {
  return readSqlFilesRecursive(dirPath).filter(
    (filePath) => !filePath.includes(`${path.sep}_legacy${path.sep}`),
  );
}

describe('Supabase DB/RPC RED contracts (static checks before real runtime wiring)', () => {
  it('detects current infra mode and enforces static SQL contract checks', () => {
    const packageJsonPath = path.join(ROOT, 'package.json');
    const packageJsonRaw = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonRaw) as { scripts?: Record<string, string> };
    const scripts = packageJson.scripts ?? {};

    const supabaseScriptEntries = Object.entries(scripts).filter(([, value]) => /\bsupabase\b/i.test(value));
    const hasConfigToml = fs.existsSync(path.join(SUPABASE_DIR, 'config.toml'));

    // Current repository is expected to run in static-check mode until local Supabase wiring is added.
    expect({
      hasStaticChecks: true,
      localRuntimeDetected: hasConfigToml || supabaseScriptEntries.length > 0
    }).toEqual({
      hasStaticChecks: true,
      localRuntimeDetected: false
    });
  });

  it('requires /supabase scaffolding and at least one SQL migration file', () => {
    expect(fs.existsSync(SUPABASE_DIR), 'Missing /supabase directory at repository root').toBe(true);
    expect(fs.existsSync(MIGRATIONS_DIR), 'Missing /supabase/migrations directory').toBe(true);

    const sqlFiles = readSqlFilesRecursive(MIGRATIONS_DIR);
    expect(
      sqlFiles.length,
      'Missing SQL migrations: add at least one migration file implementing schema + RPC contracts'
    ).toBeGreaterThan(0);
  });

  it('requires core schema entities for booking gateway contracts', () => {
    const sqlCorpus = readSqlFilesRecursive(MIGRATIONS_DIR)
      .map((filePath) => fs.readFileSync(filePath, 'utf8'))
      .join('\n\n');

    for (const requirement of REQUIRED_TABLE_PATTERNS) {
      expect(sqlCorpus, `Missing schema entity: ${requirement.name}`).toMatch(requirement.pattern);
    }

    for (const requirement of REQUIRED_TABLE_COLUMNS) {
      expect(sqlCorpus, `Missing schema column/constraint contract: ${requirement.name}`).toMatch(requirement.pattern);
    }
  });

  it('requires RPC signatures used by supabase booking gateway', () => {
    const sqlCorpus = readSqlFilesRecursive(MIGRATIONS_DIR)
      .map((filePath) => fs.readFileSync(filePath, 'utf8'))
      .join('\n\n');

    for (const requirement of REQUIRED_RPC_SIGNATURES) {
      expect(sqlCorpus, `Missing RPC function signature: ${requirement.name}`).toMatch(requirement.pattern);
    }
  });

  it('requires deterministic error code literals for gateway parity mapping', () => {
    const sqlCorpus = readSqlFilesRecursive(MIGRATIONS_DIR)
      .map((filePath) => fs.readFileSync(filePath, 'utf8'))
      .join('\n\n');

    for (const errorCode of REQUIRED_ERROR_CODES) {
      expect(sqlCorpus, `Missing deterministic error code literal: ${errorCode}`).toContain(errorCode);
    }
  });

  it('removes legacy notification_email_outbox from active migrations (kept only in _legacy/)', () => {
    const activeSqlCorpus = readActiveSqlFiles(MIGRATIONS_DIR)
      .map((filePath) => fs.readFileSync(filePath, 'utf8'))
      .join('\n\n');

    expect(
      activeSqlCorpus,
      'Active migrations must not redeclare the legacy notification_email_outbox table (kept only under supabase/migrations/_legacy/)',
    ).not.toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?notification_email_outbox\b/i);

    expect(
      activeSqlCorpus,
      'Active migrations must not reference notification_email_outbox recipient columns (to_email|recipient_email)',
    ).not.toMatch(/notification_email_outbox[\s\S]*?(to_email|recipient_email)/i);
  });
});
