import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const PRICING_PATH = new URL('../components/organisms/prelaunch/PrelaunchPricing.astro', import.meta.url);

describe('Contract: PremiumTrial public copy', () => {
  it('mentions the 14-day trial on the Premium pricing card before the monthly price', async () => {
    const source = await readFile(PRICING_PATH, 'utf8');

    expect(source).toMatch(/PREMIUM[\s\S]*14 días gratis[\s\S]*\/mes/);
  });

  it('lists equipo and seña on both Free and Premium cards', async () => {
    const source = await readFile(PRICING_PATH, 'utf8');

    expect(source).toMatch(/FREE:[\s\S]*Equipo con varios profesionales[\s\S]*Seña opcional en el turnero[\s\S]*PREMIUM:/);
    expect(source).toMatch(/PREMIUM:[\s\S]*Equipo con varios profesionales[\s\S]*Seña opcional en el turnero/);
    expect(source).not.toMatch(/Agenda sin límites/);
    expect(source).not.toMatch(/Más rubros/);
  });
});
