import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function source(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Contract: MVP landing pricing catalog', () => {
  it('ships only Free and Premium pricing cards in the static fallback', () => {
    const plans = source('src/lib/plans.ts');

    expect(plans).toContain("const CANONICAL_PLAN_ORDER = ['FREE', 'PREMIUM']");
    expect(plans).toContain("code: 'PREMIUM'");
    expect(plans).toContain('price: 25000');
    expect(plans).not.toMatch(/code:\s*['"](?:STARTER|GROWTH|PRO)['"]/);
  });

  it('does not advertise legacy paid tiers, multi-sucursal, or professional-count promises', () => {
    const activePricingSources = [
      source('src/components/molecules/PlanCard.astro'),
      source('src/components/organisms/Pricing.astro'),
      source('src/components/organisms/FAQ.astro')
    ].join('\n');

    expect(activePricingSources).toMatch(/Premium/i);
    expect(activePricingSources).toMatch(/Turnos ilimitados/i);
    expect(activePricingSources).not.toMatch(/\bStarter\b|\bGrowth\b|\bPro\b|multi-sucursal|varias agendas|profesionales\/agendas/i);
  });

  it('keeps the legacy subscription page on the MVP Free/Premium model', () => {
    const subscriptionPage = source('src/pages/billing/subscription.astro');

    expect(subscriptionPage).toContain('PREMIUM');
    expect(subscriptionPage).toContain('$25.000/mes');
    expect(subscriptionPage).toContain('orvel.pagos');
    expect(subscriptionPage).not.toMatch(/Hasta 15 turnos/i);
    expect(subscriptionPage).not.toMatch(/\$12\s*\/\s*mes|\$22\s*\/\s*mes|\$39\s*\/\s*mes/);
    expect(subscriptionPage).not.toMatch(/quarterly|annual/);
  });
});
