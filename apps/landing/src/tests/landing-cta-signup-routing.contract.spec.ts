import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const HEADER_PATH = new URL('../components/organisms/Header.astro', import.meta.url);
const HERO_PATH = new URL('../components/organisms/Hero.astro', import.meta.url);
const CTA_PATH = new URL('../components/organisms/CTA.astro', import.meta.url);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expectAnchorCtaToSignup(source: string, ctaText: string, sourceName: string): void {
  const text = escapeRegex(ctaText);
  const anchorRegex = new RegExp(
    `<a[^>]*href=["']/auth/signup/plan["'][^>]*>\\s*${text}(?:\\s|<[^>]*>)*<\\/a>`,
    'i'
  );

  expect(
    anchorRegex.test(source),
    `Expected CTA "${ctaText}" to be rendered as an anchor with href="/auth/signup/plan" in ${sourceName}.`
  ).toBe(true);
}

describe('Contract: landing CTA routing to signup', () => {
  it('navbar CTA "Crear cuenta" points to /auth/signup/plan', async () => {
    const source = await readFile(HEADER_PATH, 'utf8');

    expectAnchorCtaToSignup(source, 'Crear cuenta', 'Header.astro');
  });

  it('hero CTA "Empezar ahora" points to /auth/signup/plan', async () => {
    const source = await readFile(HERO_PATH, 'utf8');

    expectAnchorCtaToSignup(source, 'Empezar ahora', 'Hero.astro');
  });

  it('final CTA "Probalo hoy" points to /auth/signup/plan', async () => {
    const source = await readFile(CTA_PATH, 'utf8');

    expectAnchorCtaToSignup(source, 'Probalo hoy', 'CTA.astro');
  });
});
