import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const PUBLIC_PRICING_PATH = new URL('../components/organisms/Pricing.astro', import.meta.url);
const PUBLIC_INDEX_PATH = new URL('../pages/lanzamiento.astro', import.meta.url);
const SIGNUP_PLAN_CARDS_PATH = new URL('../components/organisms/SignupPlanCards.astro', import.meta.url);

async function source(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

describe('Contract: monthly-only pricing visibility and Free plan rendering', () => {
  it('keeps Free renderable for monthly public pricing instead of removing it server-side', async () => {
    const pricingSource = await source(PUBLIC_PRICING_PATH);

    expect(pricingSource).toMatch(/plansWithBilling\.map\(\(plan\)\s*=>/);
    expect(pricingSource).not.toMatch(/filter\(\s*p\s*=>\s*p\.code\s*!==\s*['"]FREE['"]\s*\)/);
  });

  it('does not render quarterly or annual billing toggle options for the MVP', async () => {
    const publicPricingSource = await source(PUBLIC_PRICING_PATH);
    const signupCardsSource = await source(SIGNUP_PLAN_CARDS_PATH);
    const combined = `${publicPricingSource}\n${signupCardsSource}`;

    expect(combined).not.toMatch(/data-billing=["'](?:quarterly|annual)["']/);
    expect(combined).not.toMatch(/Trimestral|Anual/);
  });

  it('keeps Free visible in the monthly-only public and signup pricing paths', async () => {
    const publicIndexSource = await source(PUBLIC_INDEX_PATH);
    const signupCardsSource = await source(SIGNUP_PLAN_CARDS_PATH);
    const combined = `${publicIndexSource}\n${signupCardsSource}`;

    expect(combined).toMatch(/if \(planCode === ['"]FREE['"]\)[\s\S]*card\.hidden\s*=\s*false[\s\S]*card\.setAttribute\(['"]aria-hidden['"],\s*['"]false['"]\)/);
    expect(combined).not.toMatch(/if \(planCode === ['"]FREE['"]\)[\s\S]*(?:period|nextPeriod) !== ['"]monthly['"][\s\S]*card\.hidden\s*=\s*true/);
  });
});
