import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const HERO = new URL('../components/organisms/prelaunch/PrelaunchHero.astro', import.meta.url);
const FAQ = new URL('../components/organisms/prelaunch/PrelaunchFaq.astro', import.meta.url);
const PRELANZAMIENTO = new URL('../pages/prelanzamiento.astro', import.meta.url);

describe('Contract: public home is Orvel, not prelaunch', () => {
  it('brands the hero as Orvel instead of a wait-to-use launch', async () => {
    const source = await readFile(HERO, 'utf8');

    expect(source).toMatch(/>\s*Orvel\s*</);
    expect(source).not.toMatch(/Ya podés usarlo/);
  });

  it('does not ask whether Orvel is available yet', async () => {
    const source = await readFile(FAQ, 'utf8');

    expect(source).not.toMatch(/¿Ya puedo usarlo\?/);
  });

  it('sends /prelanzamiento to the home', async () => {
    const source = await readFile(PRELANZAMIENTO, 'utf8');

    expect(source).toMatch(/Astro\.redirect\(\s*['"]\/['"]/);
    expect(source).not.toMatch(/organisms\/prelaunch\/PrelaunchHero/);
  });
});
