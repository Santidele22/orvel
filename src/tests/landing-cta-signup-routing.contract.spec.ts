import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const INDEX_PAGE_PATH = new URL('../pages/index.astro', import.meta.url);

async function loadIndexSource(): Promise<string> {
  return readFile(INDEX_PAGE_PATH, 'utf8');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expectAnchorCtaToSignup(source: string, ctaText: string): void {
  const text = escapeRegex(ctaText);
  const anchorRegex = new RegExp(`<a[^>]*href=["']/auth/signup/plan["'][^>]*>\\s*${text}\\s*<\\/a>`, 'i');

  expect(
    anchorRegex.test(source),
    `Expected CTA "${ctaText}" to be rendered as an anchor with href="/auth/signup/plan" in src/pages/index.astro.`
  ).toBe(true);
}

describe('Contract: landing CTA routing to signup', () => {
  it('navbar CTA "Crear cuenta gratis" points to /auth/signup/plan', async () => {
    const source = await loadIndexSource();

    expectAnchorCtaToSignup(source, 'Crear cuenta gratis');
  });

  it('hero CTA "Comenzar prueba gratis" points to /auth/signup/plan', async () => {
    const source = await loadIndexSource();

    expectAnchorCtaToSignup(source, 'Comenzar prueba gratis');
  });
});
