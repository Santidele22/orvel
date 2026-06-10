import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const PRICING_PATH = new URL('../components/organisms/Pricing.astro', import.meta.url);
const PLAN_CARD_PATH = new URL('../components/molecules/PlanCard.astro', import.meta.url);
const SIGNUP_PLAN_CARD_PATH = new URL('../components/molecules/SignupPlanCard.astro', import.meta.url);
const BILLING_SUBSCRIPTION_PATH = new URL('../pages/billing/subscription.astro', import.meta.url);
const PLANS_PATH = new URL('../lib/plans.ts', import.meta.url);

describe('Contract: Orvel pricing plans and multi-branch add-on', () => {
  it('shows multi-sucursal as a separate add-on, not bundled as a base plan feature', async () => {
    const pricingSource = await readFile(PRICING_PATH, 'utf8');
    const planCardSource = await readFile(PLAN_CARD_PATH, 'utf8');
    const signupPlanCardSource = await readFile(SIGNUP_PLAN_CARD_PATH, 'utf8');
    const billingSubscriptionSource = await readFile(BILLING_SUBSCRIPTION_PATH, 'utf8');
    const basePlanSources = `${planCardSource}\n${signupPlanCardSource}\n${billingSubscriptionSource}`;

    expect(pricingSource).toMatch(/Multi-sucursal/i);
    expect(pricingSource).toMatch(/20\.000|20000/);
    expect(pricingSource).toMatch(/local adicional|sucursal adicional/i);
    expect(pricingSource).toMatch(/Todos los planes incluyen 1 local|planes base incluyen 1 local/i);
    expect(pricingSource).toMatch(/Consultar multi-sucursal|Sumar sucursal|Hablar con Orvel/i);

    expect(planCardSource).toMatch(/Incluye 1 local/i);
    expect(planCardSource).not.toMatch(/Múltiples sucursales/i);

    expect(signupPlanCardSource).toMatch(/1 local/i);
    expect(basePlanSources).not.toMatch(/Hasta\s+(?:[2-9]|\d{2,})\s+(?:locales|sucursales)/i);
    expect(basePlanSources).not.toMatch(/Múltiples\s+(?:locales|sucursales)/i);
  });

  it('keeps current canonical base plan pricing and avoids checkout language in the landing pricing UI', async () => {
    const pricingSource = await readFile(PRICING_PATH, 'utf8');
    const plansSource = await readFile(PLANS_PATH, 'utf8');

    for (const expected of ['12900', '24900', '44900']) {
      expect(plansSource).toContain(expected);
    }

    expect(`${pricingSource}\n${plansSource}`).not.toMatch(/checkout|Comprar ahora/i);
  });
});
