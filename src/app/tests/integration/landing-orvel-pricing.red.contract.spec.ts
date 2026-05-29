import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

type Cadence = 'monthly' | 'quarterly' | 'annual';

const ROOT = process.cwd();
const MIGRATIONS_DIR = resolve(ROOT, 'supabase', 'migrations');

const EXPECTED_PRICING_MATRIX: Array<{
  tier: 'starter' | 'growth' | 'pro';
  monthly: number;
  quarterly: number;
  annual: number;
}> = [
  { tier: 'starter', monthly: 12, quarterly: 34, annual: 122 },
  { tier: 'growth', monthly: 22, quarterly: 63, annual: 224 },
  { tier: 'pro', monthly: 39, quarterly: 111, annual: 398 }
];

function readSqlCorpus(): string {
  expect(existsSync(MIGRATIONS_DIR), `Missing migrations directory: ${MIGRATIONS_DIR}`).toBe(true);

  const sqlFiles = readdirSync(MIGRATIONS_DIR)
    .filter((entry) => entry.endsWith('.sql'))
    .sort();

  expect(sqlFiles.length, 'Expected at least one SQL migration for billing').toBeGreaterThan(0);

  return sqlFiles.map((entry) => readFileSync(join(MIGRATIONS_DIR, entry), 'utf8')).join('\n\n');
}

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

function expectedSeedPattern(tier: string, cadence: Cadence, price: number): RegExp {
  const frequency = cadence === 'monthly' ? 1 : cadence === 'quarterly' ? 3 : 12;
  const durationDays = cadence === 'monthly' ? 30 : cadence === 'quarterly' ? 90 : 365;

  return new RegExp(
    String.raw`\('${tier}_${cadence}'[\s\S]*?,\s*'Plan\s+${tier}\s+${cadence === 'monthly' ? 'Mensual' : cadence === 'quarterly' ? 'Trimestral' : 'Anual'}'[\s\S]*?,\s*${price}\s*,\s*'ARS'\s*,\s*${frequency}\s*,\s*'${cadence === 'monthly' ? 'month' : cadence === 'quarterly' ? 'quarter' : 'year'}'\s*,\s*${durationDays}\s*,\s*true\)`,
    'i'
  );
}

describe('Orvel pricing landing RED contracts', () => {
  it('plans table and seed contract must represent starter/growth/pro across monthly, quarterly, and annual billing', () => {
    const sqlCorpus = readSqlCorpus();

    expect(sqlCorpus).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?public\.plans\b/i);
    expect(sqlCorpus).toMatch(/billing_frequency_type\s+text\s+not\s+null/i);

    for (const plan of EXPECTED_PRICING_MATRIX) {
      expect(sqlCorpus, `Missing seeded rows for tier ${plan.tier}`).toMatch(
        expectedSeedPattern(plan.tier, 'monthly', plan.monthly)
      );
      expect(sqlCorpus, `Missing seeded rows for tier ${plan.tier}`).toMatch(
        expectedSeedPattern(plan.tier, 'quarterly', plan.quarterly)
      );
      expect(sqlCorpus, `Missing seeded rows for tier ${plan.tier}`).toMatch(
        expectedSeedPattern(plan.tier, 'annual', plan.annual)
      );
    }
  });

  it('landing pricing source must expose the 3x3 cadence matrix instead of monthly-only plan cards', async () => {
    const source = await import('../../core/billing/landing-plans-source.api');
    const plans = await source.fetchLandingPlans();

    expect(plans).toHaveLength(3);
    expect(plans).toEqual(
      expect.arrayContaining(
        EXPECTED_PRICING_MATRIX.map((plan) =>
          expect.objectContaining({
            tier: plan.tier,
            billingCadences: {
              monthly: plan.monthly,
              quarterly: plan.quarterly,
              annual: plan.annual
            }
          })
        )
      )
    );
  });

  it('signup plan landing route/component must use Orvel-styled plan cards and reject the legacy static layout', () => {
    const routes = readSource('src/app/app.routes.ts');
    const componentTs = readSource('src/app/features/onboarding/pages/signup-plan-step.component.ts');
    const templateHtml = readSource('src/app/features/onboarding/pages/signup-plan-step.page.html');

    expect(routes).toMatch(/path:\s*'auth\/signup\/plan'/);
    expect(componentTs).toMatch(/SignupPlanStepPageComponent/);

    expect(templateHtml).toMatch(/plan-cards-grid|plan-card|monthly|quarterly|annual/i);
    expect(templateHtml).toMatch(/STARTER|GROWTH|PRO/i);
    expect(templateHtml).not.toMatch(/FREE|BASIC|MEDIUM/i);
  });
});
