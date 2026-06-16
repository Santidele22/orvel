import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const PUBLIC_PRICING_PATH = new URL('../components/organisms/Pricing.astro', import.meta.url);
const PUBLIC_INDEX_PATH = new URL('../pages/index.astro', import.meta.url);
const SIGNUP_PLAN_CARDS_PATH = new URL('../components/organisms/SignupPlanCards.astro', import.meta.url);

async function source(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

describe('Contract: pricing billing toggle visibility and Free plan filtering', () => {
  it('keeps Free renderable for monthly public pricing instead of removing it server-side', async () => {
    const pricingSource = await source(PUBLIC_PRICING_PATH);

    expect(pricingSource).toMatch(/plansWithBilling\.map\(\(plan\)\s*=>/);
    expect(pricingSource).not.toMatch(/filter\(\s*p\s*=>\s*p\.code\s*!==\s*['"]FREE['"]\s*\)/);
  });

  it('uses explicit button semantics and pressed state for all billing toggle options', async () => {
    const publicPricingSource = await source(PUBLIC_PRICING_PATH);
    const signupCardsSource = await source(SIGNUP_PLAN_CARDS_PATH);
    const combined = `${publicPricingSource}\n${signupCardsSource}`;

    for (const billing of ['monthly', 'quarterly', 'annual']) {
      expect(combined).toMatch(new RegExp(`<button[^>]*type=["']button["'][^>]*data-billing=["']${billing}["']`));
      expect(combined).toMatch(new RegExp(`<button[^>]*aria-pressed=["'](?:true|false)["'][^>]*data-billing=["']${billing}["']`));
    }
  });

  it('hides Free with the hidden attribute and aria-hidden outside monthly in public and signup pricing', async () => {
    const publicIndexSource = await source(PUBLIC_INDEX_PATH);
    const signupCardsSource = await source(SIGNUP_PLAN_CARDS_PATH);
    const combined = `${publicIndexSource}\n${signupCardsSource}`;

    expect(combined).toMatch(/if \(planCode === ['"]FREE['"]\)[\s\S]*(?:period|nextPeriod) !== ['"]monthly['"][\s\S]*card\.hidden\s*=\s*true[\s\S]*card\.setAttribute\(['"]aria-hidden['"],\s*['"]true['"]\)/);
    expect(combined).toMatch(/if \(planCode === ['"]FREE['"]\)[\s\S]*card\.hidden\s*=\s*false[\s\S]*card\.setAttribute\(['"]aria-hidden['"],\s*['"]false['"]\)/);
  });
});
