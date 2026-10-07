import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const PRICING_PATH = new URL('../components/organisms/prelaunch/PrelaunchPricing.astro', import.meta.url);
const PUBLIC_COPY_PATHS = [
  PRICING_PATH,
  new URL('../components/organisms/prelaunch/PrelaunchHero.astro', import.meta.url),
  new URL('../components/organisms/prelaunch/PrelaunchFaq.astro', import.meta.url),
  new URL('../pages/index.astro', import.meta.url)
];

describe('Contract: no PremiumTrial public copy', () => {
  it('never promises a 14-day Premium trial on pricing, hero, FAQ, or home meta copy', async () => {
    for (const path of PUBLIC_COPY_PATHS) {
      const source = await readFile(path, 'utf8');

      expect(source, `${path.pathname} must not promise trial days`).not.toMatch(/14 días/i);
      expect(source, `${path.pathname} must not promise trial days`).not.toMatch(/días gratis|días de prueba/i);
      expect(source, `${path.pathname} must not promise a trial`).not.toMatch(/\btrial\b|prueba gratis/i);
    }
  });

  it('lists equipo and seña on both Free and Premium cards', async () => {
    const source = await readFile(PRICING_PATH, 'utf8');

    expect(source).toMatch(/FREE:[\s\S]*Equipo con varios profesionales[\s\S]*Seña opcional en el turnero[\s\S]*PREMIUM:/);
    expect(source).toMatch(/PREMIUM:[\s\S]*Equipo con varios profesionales[\s\S]*Seña opcional en el turnero/);
    expect(source).not.toMatch(/Agenda sin límites/);
    expect(source).not.toMatch(/Más rubros/);
  });
});
