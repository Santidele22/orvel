import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';

const INDEX_PATH = new URL('../pages/index.astro', import.meta.url);
const LANZAMIENTO_PATH = new URL('../pages/lanzamiento.astro', import.meta.url);
const PRELANZAMIENTO_PATH = new URL('../pages/prelanzamiento.astro', import.meta.url);
const PRELAUNCH_DIR = new URL('../components/organisms/prelaunch/', import.meta.url);

const COMPOSED_PRELAUNCH = [
  'PrelaunchHeader.astro',
  'PrelaunchHero.astro',
  'EarlyBird.astro',
  'PrelaunchProblem.astro',
  'PrelaunchFeatures.astro',
  'PrelaunchHowItWorks.astro',
  'PrelaunchProductShowcase.astro',
  'PrelaunchRubros.astro',
  'PrelaunchPricing.astro',
  'PrelaunchFaq.astro',
  'PrelaunchCta.astro'
] as const;

async function source(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

async function composedPrelaunchSources(): Promise<string> {
  const chunks = await Promise.all(
    COMPOSED_PRELAUNCH.map((file) => source(new URL(file, PRELAUNCH_DIR)))
  );
  return chunks.join('\n');
}

function expectUsablePrelaunchComposition(page: string): void {
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchHeader/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchHero/);
  expect(page).toMatch(/organisms\/prelaunch\/EarlyBird/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchProblem/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchFeatures/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchHowItWorks/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchProductShowcase/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchHowItWorks[\s\S]*organisms\/prelaunch\/PrelaunchProductShowcase/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchRubros/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchPricing/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchFaq/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchCta/);

  expect(page).not.toMatch(/organisms\/prelaunch\/PrelaunchNovedades/);
  expect(page).not.toMatch(/organisms\/prelaunch\/WaitlistModal/);
  expect(page).not.toMatch(/organisms\/prelaunch\/StickyWaitlistCta/);

  expect(page).not.toMatch(/import Header from ['"]\.\.\/components\/organisms\/Header\.astro['"]/);
  expect(page).not.toMatch(/import Hero from ['"]\.\.\/components\/organisms\/Hero\.astro['"]/);
  expect(page).not.toMatch(/import CTA from ['"]\.\.\/components\/organisms\/CTA\.astro['"]/);
  expect(page).not.toMatch(/<Header\s*\/>/);
  expect(page).not.toMatch(/<Hero\s*\/>/);
  expect(page).not.toMatch(/<CTA\s*\/>/);
}

describe('Contract: public index is the usable prelaunch landing', () => {
  it('composes the production prelaunch page with Cómo funciona, without waitlist or novedades', async () => {
    const index = await source(INDEX_PATH);
    expectUsablePrelaunchComposition(index);
  });

  it('wires public CTAs to login and signup, not the waitlist modal', async () => {
    const index = await source(INDEX_PATH);
    const prelaunch = await composedPrelaunchSources();
    const publicSurface = `${index}\n${prelaunch}`;

    expect(publicSurface).toContain('/auth/login');
    expect(publicSurface).toContain('/auth/signup/plan');
    expect(publicSurface).not.toMatch(/js-open-waitlist/);
    expect(publicSurface).not.toMatch(/Quiero mi lugar/);
    expect(publicSurface).not.toMatch(/fundadores?/i);
    expect(index).not.toMatch(/function\s+handlePlanSelection|const\s+handlePlanSelection/);
    expect(index).not.toContain('/auth/signup/credentials');
  });
});

describe('Contract: /prelanzamiento still composes the same usable prelaunch page', () => {
  it('keeps old links on the remixed production page', async () => {
    const prelanzamiento = await source(PRELANZAMIENTO_PATH);
    expectUsablePrelaunchComposition(prelanzamiento);
  });
});

describe('Contract: launch landing stays parked at /lanzamiento', () => {
  it('mounts launch Header/Hero/Pricing/CTA and handlePlanSelection', async () => {
    const lanzamiento = await source(LANZAMIENTO_PATH);

    expect(lanzamiento).toMatch(/import Header from ['"]\.\.\/components\/organisms\/Header\.astro['"]/);
    expect(lanzamiento).toMatch(/import Hero from ['"]\.\.\/components\/organisms\/Hero\.astro['"]/);
    expect(lanzamiento).toMatch(/import Pricing from ['"]\.\.\/components\/organisms\/Pricing\.astro['"]/);
    expect(lanzamiento).toMatch(/import CTA from ['"]\.\.\/components\/organisms\/CTA\.astro['"]/);
    expect(lanzamiento).toMatch(/<Header\s*\/>/);
    expect(lanzamiento).toMatch(/<Hero\s*\/>/);
    expect(lanzamiento).toMatch(/<Pricing/);
    expect(lanzamiento).toMatch(/<CTA\s*\/>/);
    expect(lanzamiento).toMatch(/function\s+handlePlanSelection|const\s+handlePlanSelection/);
    expect(lanzamiento).toContain('/auth/signup/credentials');
    expect(lanzamiento).not.toMatch(/organisms\/prelaunch\/PrelaunchHero/);
  });
});

describe('Contract: unused waitlist files remain in the repo', () => {
  it('does not delete waitlist organisms that production may still need later', async () => {
    const files = await readdir(PRELAUNCH_DIR);
    expect(files).toEqual(expect.arrayContaining([
      'WaitlistModal.astro',
      'StickyWaitlistCta.astro',
      'PrelaunchNovedades.astro'
    ]));
  });
});
