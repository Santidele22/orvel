import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type LandingPlanViewModel = {
  code: 'STARTER' | 'GROWTH' | 'PRO';
  tier: 'starter' | 'growth' | 'pro';
  name: string;
  priceMonthlyCents: number;
  billingCadences: { monthly: number; quarterly: number; annual: number };
  maxLocales: number;
  maxRubros: number;
  subscriptionProvider: 'mercado_pago';
};

type LandingPlansSourceModule = {
  fetchLandingPlans: () => Promise<LandingPlanViewModel[]>;
};

type MercadoPagoSubscriptionEnvModule = {
  REQUIRED_MERCADO_PAGO_SUBSCRIPTION_ENV_KEYS: readonly string[];
  loadMercadoPagoSubscriptionEnv: (source?: Record<string, string | undefined>) => Record<string, string>;
};

const ROOT = process.cwd();
const CORE_DIR = path.join(ROOT, 'src', 'app', 'core');
const SUPABASE_MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');

function readSqlCorpus(): string {
  expect(fs.existsSync(SUPABASE_MIGRATIONS_DIR), `Missing migrations directory: ${SUPABASE_MIGRATIONS_DIR}`).toBe(true);

  const sqlFiles = fs.readdirSync(SUPABASE_MIGRATIONS_DIR).filter((entry) => entry.endsWith('.sql')).sort();
  expect(sqlFiles.length, 'Expected SQL migrations for billing/plan contracts').toBeGreaterThan(0);

  return sqlFiles.map((entry) => fs.readFileSync(path.join(SUPABASE_MIGRATIONS_DIR, entry), 'utf8')).join('\n\n');
}

async function loadLandingPlansSource(): Promise<LandingPlansSourceModule> {
  try {
    const mod = await import('../../core/billing/landing-plans-source.api');
    return mod as LandingPlansSourceModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/billing/landing-plans-source.api.ts exporting fetchLandingPlans() that reads plan data from existing DB contract (RPC/view/table) without depending on missing public.plans.'
    );
  }
}

async function loadMercadoPagoSubscriptionEnvModule(): Promise<MercadoPagoSubscriptionEnvModule> {
  try {
    const mod = await import('../../core/payments/subscriptions/mercadopago-subscription-env');
    return mod as MercadoPagoSubscriptionEnvModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/payments/subscriptions/mercadopago-subscription-env.ts exporting REQUIRED_MERCADO_PAGO_SUBSCRIPTION_ENV_KEYS and loadMercadoPagoSubscriptionEnv(source).' 
    );
  }
}

describe('Landing plans + Mercado Pago subscriptions readiness (RED contracts)', () => {
  describe('Landing plans source contract', () => {
    it('must define a fallback contract for landing plans beyond direct public.plans reads', () => {
      const sqlCorpus = readSqlCorpus();

      expect(sqlCorpus).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?public\.plan_entitlements\b/i);
      expect(sqlCorpus).toMatch(/create\s+or\s+replace\s+function\s+public\.get_business_entitlements_snapshot\s*\(/i);
    });

    it('must expose a landing plans adapter that maps DB contract fields to landing-required view model', async () => {
      const source = await loadLandingPlansSource();
      const plans = await source.fetchLandingPlans();

      expect(Array.isArray(plans)).toBe(true);
      expect(plans.length).toBe(3);
      expect(plans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: expect.stringMatching(/STARTER|GROWTH|PRO/),
            tier: expect.stringMatching(/starter|growth|pro/),
            name: expect.any(String),
            priceMonthlyCents: expect.any(Number),
            billingCadences: expect.objectContaining({
              monthly: expect.any(Number),
              quarterly: expect.any(Number),
              annual: expect.any(Number)
            }),
            maxLocales: expect.any(Number),
            maxRubros: expect.any(Number),
            subscriptionProvider: 'mercado_pago'
          })
        ])
      );
    });
  });

  describe('Mercado Pago subscription env contract', () => {
    it('must enforce required MP subscription env keys via explicit loader (no hardcoded secrets)', async () => {
      const env = await loadMercadoPagoSubscriptionEnvModule();

      expect(env.REQUIRED_MERCADO_PAGO_SUBSCRIPTION_ENV_KEYS).toEqual(
        expect.arrayContaining([
          'MP_ACCESS_TOKEN',
          'MP_WEBHOOK_SECRET',
          'MP_PREAPPROVAL_PLAN_ID',
          'APP_BASE_URL'
        ])
      );
      expect(() => env.loadMercadoPagoSubscriptionEnv({ APP_BASE_URL: 'https://app.salon.test' })).toThrow(
        /Missing required/i
      );
    });

    it('must not contain hardcoded Mercado Pago credentials in core source files', () => {
      expect(fs.existsSync(CORE_DIR), `Missing core directory: ${CORE_DIR}`).toBe(true);

      const tsFiles = fs.readdirSync(path.join(CORE_DIR, 'payments'), { recursive: true })
        .filter((entry): entry is string => typeof entry === 'string' && entry.endsWith('.ts'))
        .map((entry) => path.join(CORE_DIR, 'payments', entry));

      expect(tsFiles.length).toBeGreaterThan(0);

      const forbiddenLiterals = [
        /TEST-\d{5,}/i,
        /APP_USR-[A-Za-z0-9_-]{8,}/,
        /access[_-]?token\s*[:=]\s*['"][A-Za-z0-9._-]{12,}['"]/i,
        /mp_(public|access)_key\s*[:=]\s*['"][A-Za-z0-9._-]{8,}['"]/i
      ];

      for (const filePath of tsFiles) {
        const source = fs.readFileSync(filePath, 'utf8');
        for (const pattern of forbiddenLiterals) {
          expect(source, `Hardcoded credential pattern found in ${path.relative(ROOT, filePath)}`).not.toMatch(pattern);
        }
      }
    });
  });
});
