import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const SHOWCASE_PATH = new URL(
  '../components/organisms/prelaunch/PrelaunchProductShowcase.astro',
  import.meta.url
);
const INDEX_PATH = new URL('../pages/index.astro', import.meta.url);
const PRELANZAMIENTO_PATH = new URL('../pages/prelanzamiento.astro', import.meta.url);

const JARGON = /\b(walk-in|no-show|buffers?|cta|saas|pwa|whatsapp)\b/i;

describe('Contract: prelaunch product showcase section', () => {
  it('exists as a dark Orvel organism with Agenda and Clientes tabs, no Reportes', async () => {
    const source = await readFile(SHOWCASE_PATH, 'utf8');

    expect(source).toMatch(/id="[^"]+"|data-product-showcase/);
    expect(source).toMatch(/<section\b[^>]*\blanding-section\b/);
    expect(source).toMatch(/<section\b[^>]*\bbg-bg-primary\b/);
    expect(source).toContain('role="tablist"');
    expect(source).toMatch(/<button\b[^>]*\btype="button"/);
    expect(source).toContain('role="tab"');
    expect(source).toContain('aria-selected');
    expect(source).toContain('Agenda');
    expect(source).toContain('Clientes');
    expect(source).not.toMatch(/Reportes/i);
    expect(source).toContain('data-product-desktop');
    expect(source).toContain('data-product-phone');
    expect(source).toContain('landing-card');
    expect(source).toContain('text-text-primary');
    expect(source).not.toMatch(/cloxy/i);
    expect(source).not.toMatch(JARGON);
    expect(source).not.toMatch(/fundadores?/i);
  });

  it('is composed after Cómo funciona on index and prelanzamiento', async () => {
    const index = await readFile(INDEX_PATH, 'utf8');
    const prelanzamiento = await readFile(PRELANZAMIENTO_PATH, 'utf8');

    for (const page of [index, prelanzamiento]) {
      expect(page).toMatch(/organisms\/prelaunch\/PrelaunchProductShowcase/);
      expect(page).toMatch(
        /organisms\/prelaunch\/PrelaunchHowItWorks[\s\S]*organisms\/prelaunch\/PrelaunchProductShowcase/
      );
      expect(page).not.toMatch(/organisms\/prelaunch\/PrelaunchNovedades/);
      expect(page).not.toMatch(/organisms\/prelaunch\/WaitlistModal/);
    }
  });
});
