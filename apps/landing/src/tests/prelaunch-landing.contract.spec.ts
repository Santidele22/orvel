import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';

const INDEX_PATH = new URL('../pages/index.astro', import.meta.url);
const LANZAMIENTO_PATH = new URL('../pages/lanzamiento.astro', import.meta.url);
const PRELANZAMIENTO_PATH = new URL('../pages/prelanzamiento.astro', import.meta.url);
const PRELAUNCH_DIR = new URL('../components/organisms/prelaunch/', import.meta.url);

async function source(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

async function prelaunchSources(): Promise<string> {
  const files = await readdir(PRELAUNCH_DIR);
  const chunks = await Promise.all(
    files.filter((file) => file.endsWith('.astro')).map((file) => source(new URL(file, PRELAUNCH_DIR)))
  );
  return chunks.join('\n');
}

function expectWaitlistComposition(page: string): void {
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchHeader/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchHero/);
  expect(page).toMatch(/organisms\/prelaunch\/EarlyBird/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchProblem/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchFeatures/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchRubros/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchNovedades/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchPricing/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchFaq/);
  expect(page).toMatch(/organisms\/prelaunch\/PrelaunchCta/);
  expect(page).toMatch(/organisms\/prelaunch\/WaitlistModal/);

  expect(page).not.toMatch(/import Header from ['"]\.\.\/components\/organisms\/Header\.astro['"]/);
  expect(page).not.toMatch(/import Hero from ['"]\.\.\/components\/organisms\/Hero\.astro['"]/);
  expect(page).not.toMatch(/import CTA from ['"]\.\.\/components\/organisms\/CTA\.astro['"]/);
  expect(page).not.toMatch(/<Header\s*\/>/);
  expect(page).not.toMatch(/<Hero\s*\/>/);
  expect(page).not.toMatch(/<CTA\s*\/>/);
}

describe('Contract: public index is the prelaunch waitlist landing', () => {
  it('composes prelaunch organisms instead of launch Header/Hero/CTA', async () => {
    const index = await source(INDEX_PATH);
    expectWaitlistComposition(index);
  });

  it('wires public CTAs to the waitlist modal, not signup or credentials', async () => {
    const index = await source(INDEX_PATH);
    const prelaunch = await prelaunchSources();
    const publicSurface = `${index}\n${prelaunch}`;

    expect(publicSurface).toMatch(/js-open-waitlist/);
    expect(publicSurface).not.toContain('/auth/signup/plan');
    expect(publicSurface).not.toContain('/auth/login');
    expect(index).not.toMatch(/function\s+handlePlanSelection|const\s+handlePlanSelection/);
    expect(index).not.toContain('/auth/signup/credentials');
  });
});

describe('Contract: /prelanzamiento still composes the waitlist organisms', () => {
  it('keeps the waitlist page for old links', async () => {
    const prelanzamiento = await source(PRELANZAMIENTO_PATH);
    expectWaitlistComposition(prelanzamiento);
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
