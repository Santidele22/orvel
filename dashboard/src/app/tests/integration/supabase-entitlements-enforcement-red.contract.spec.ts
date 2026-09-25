import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SUPABASE_MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');

const REQUIRED_SQL_CONTRACTS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'business entitlements snapshot RPC',
    pattern:
      /create\s+or\s+replace\s+function\s+(?:public\.)?get_business_entitlements_snapshot\s*\((?=[^)]*\bbusiness_id\s+(?:uuid|text)\b)[^)]*\)/i
  },
  {
    name: 'server-side entitlement assertion RPC',
    pattern:
      /create\s+or\s+replace\s+function\s+(?:public\.)?assert_business_entitlement\s*\((?=[^)]*\bbusiness_id\s+(?:uuid|text)\b)(?=[^)]*\bmetric\s+text\b)(?=[^)]*\brequested_units\s+integer\b)[^)]*\)/i
  },
  {
    name: 'subscription source of truth table',
    pattern: /create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?business_subscriptions\b/i
  },
  {
    name: 'plan matrix table',
    pattern: /create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?plan_entitlements\b/i
  },
  {
    name: 'fixed matrix row FREE 1/1',
    pattern: /\bFREE\b[\s\S]*?(?:max_locales\s*[,=]\s*1|1\s*[,)]\s*1)/i
  },
  {
    name: 'fixed matrix row BASIC 1/1',
    pattern: /\bBASIC\b[\s\S]*?(?:max_locales\s*[,=]\s*1|1\s*[,)]\s*1)/i
  },
  {
    name: 'fixed matrix row MEDIUM 3/3',
    pattern: /\bMEDIUM\b[\s\S]*?(?:max_locales\s*[,=]\s*3|3\s*[,)]\s*3)/i
  },
  {
    name: 'fixed matrix row PRO 10/10',
    pattern: /\bPRO\b[\s\S]*?(?:max_locales\s*[,=]\s*10|10\s*[,)]\s*10)/i
  }
];

const REQUIRED_ERROR_CODES = ['SUBSCRIPTION_NOT_ACTIVE', 'ENTITLEMENT_LIMIT_EXCEEDED', 'PLAN_MATRIX_MISSING'];

type EntitlementSnapshot = {
  businessId: string;
  planCode: 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';
  limits: {
    maxLocales: number;
    maxRubros: number;
  };
  usage: {
    locales: number;
    rubros: number;
  };
  source: 'server';
};

type EntitlementDecision =
  | {
      allowed: true;
      reason: 'OK';
      remaining: number;
    }
  | {
      allowed: false;
      reason: 'ENTITLEMENT_LIMIT_EXCEEDED' | 'SUBSCRIPTION_NOT_ACTIVE';
      remaining: 0;
    };

type ServerEntitlementsModule = {
  getBusinessEntitlementsSnapshot: (input: { businessId: string }) => Promise<EntitlementSnapshot>;
  assertBusinessEntitlement: (input: {
    businessId: string;
    metric: 'maxLocales' | 'maxRubros';
    requestedUnits: number;
  }) => Promise<EntitlementDecision>;
};

function readSqlCorpus(): string {
  if (!fs.existsSync(SUPABASE_MIGRATIONS_DIR)) {
    return '';
  }

  const entries = fs.readdirSync(SUPABASE_MIGRATIONS_DIR);
  const sqlFiles = entries
    .filter((entry) => entry.endsWith('.sql'))
    .map((entry) => path.join(SUPABASE_MIGRATIONS_DIR, entry));

  return sqlFiles.map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n\n');
}

async function loadServerEntitlementsModule(): Promise<ServerEntitlementsModule> {
  try {
    const mod = await import('../../core/entitlements/server-entitlements.api');
    return mod as ServerEntitlementsModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/entitlements/server-entitlements.api.ts exporting getBusinessEntitlementsSnapshot({ businessId }) and assertBusinessEntitlement({ businessId, metric, requestedUnits }).'
    );
  }
}

describe('Supabase/server entitlement enforcement RED contracts', () => {
  it('requires SQL contracts for subscription truth + entitlement assertion RPCs', () => {
    const sqlCorpus = readSqlCorpus();

    expect(sqlCorpus.length, 'Missing SQL migrations in /supabase/migrations for entitlement enforcement').toBeGreaterThan(0);

    for (const contract of REQUIRED_SQL_CONTRACTS) {
      expect(sqlCorpus, `Missing SQL contract: ${contract.name}`).toMatch(contract.pattern);
    }

    for (const errorCode of REQUIRED_ERROR_CODES) {
      expect(sqlCorpus, `Missing deterministic entitlement error code: ${errorCode}`).toContain(errorCode);
    }
  });

  it('defines app-side API surface that consumes server truth only (no client authority)', async () => {
    const entitlements = await loadServerEntitlementsModule();

    const snapshot = await entitlements.getBusinessEntitlementsSnapshot({ businessId: 'biz_qa_001' });
    expect(snapshot).toEqual({
      businessId: 'biz_qa_001',
      planCode: expect.stringMatching(/FREE|BASIC|MEDIUM|PRO/),
      limits: {
        maxLocales: expect.any(Number),
        maxRubros: expect.any(Number)
      },
      usage: {
        locales: expect.any(Number),
        rubros: expect.any(Number)
      },
      source: 'server'
    });

    const decision = await entitlements.assertBusinessEntitlement({
      businessId: 'biz_qa_001',
      metric: 'maxRubros',
      requestedUnits: 1
    });

    expect(decision).toEqual(
      expect.objectContaining({
        allowed: expect.any(Boolean),
        remaining: expect.any(Number)
      })
    );
  });
});
