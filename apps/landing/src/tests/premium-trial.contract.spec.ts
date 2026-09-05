import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const TRIAL_PATH = new URL('../components/organisms/prelaunch/PremiumTrial.astro', import.meta.url);
const PRICING_PATH = new URL('../components/organisms/prelaunch/PrelaunchPricing.astro', import.meta.url);

describe('Contract: PremiumTrial public copy', () => {
  it('offers 14 days of Premium without a card and points to signup', async () => {
    const source = await readFile(TRIAL_PATH, 'utf8');

    expect(source).toContain('landing-section');
    expect(source).toContain('landing-card');
    expect(source).toContain('landing-eyebrow');
    expect(source).toContain('landing-title');
    expect(source).toContain('14 días gratis');
    expect(source).toContain('14 días de Premium. Sin tarjeta.');
    expect(source).toMatch(/sin tarjeta/i);
    expect(source).toContain('/auth/signup/plan');
    expect(source).toContain('$25.000');
    expect(source).not.toMatch(/Primeros 50/);
    expect(source).not.toMatch(/50 lugares/);
    expect(source).not.toMatch(/js-open-waitlist/);
  });

  it('mentions the 14-day trial on the Premium pricing card before the monthly price', async () => {
    const source = await readFile(PRICING_PATH, 'utf8');

    expect(source).toMatch(/PREMIUM[\s\S]*14 días gratis[\s\S]*\/mes/);
  });
});
