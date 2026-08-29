import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';

const INDEX_PATH = new URL('../pages/index.astro', import.meta.url);
const LANZAMIENTO_PATH = new URL('../pages/lanzamiento.astro', import.meta.url);
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

describe('Contract: public index is the prelaunch waitlist landing', () => {
  it('composes prelaunch organisms instead of launch Header/Hero/CTA', async () => {
    const index = await source(INDEX_PATH);

    expect(index).toMatch(/organisms\/prelaunch\/PrelaunchHeader/);
    expect(index).toMatch(/organisms\/prelaunch\/PrelaunchHero/);
    expect(index).toMatch(/organisms\/prelaunch\/EarlyBird/);
    expect(index).toMatch(/organisms\/prelaunch\/PrelaunchProblem/);
    expect(index).toMatch(/organisms\/prelaunch\/PrelaunchFeatures/);
    expect(index).toMatch(/organisms\/prelaunch\/PrelaunchRubros/);
    expect(index).toMatch(/organisms\/prelaunch\/PrelaunchNovedades/);
    expect(index).toMatch(/organisms\/prelaunch\/PrelaunchPricing/);
    expect(index).toMatch(/organisms\/prelaunch\/PrelaunchFaq/);
    expect(index).toMatch(/organisms\/prelaunch\/PrelaunchCta/);
    expect(index).toMatch(/organisms\/prelaunch\/WaitlistModal/);

    expect(index).not.toMatch(/import Header from ['"]\.\.\/components\/organisms\/Header\.astro['"]/);
    expect(index).not.toMatch(/import Hero from ['"]\.\.\/components\/organisms\/Hero\.astro['"]/);
    expect(index).not.toMatch(/import CTA from ['"]\.\.\/components\/organisms\/CTA\.astro['"]/);
    expect(index).not.toMatch(/<Header\s*\/>/);
    expect(index).not.toMatch(/<Hero\s*\/>/);
    expect(index).not.toMatch(/<CTA\s*\/>/);
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

describe('Contract: launch landing stays parked at /lanzamiento', () => {
  it('still mounts launch Header/Hero/Pricing/CTA and handlePlanSelection', async () => {
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
  });
});
