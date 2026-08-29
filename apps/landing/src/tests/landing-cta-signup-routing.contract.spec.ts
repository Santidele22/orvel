import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import { buildInAppAuthRedirect } from '../lib/in-app-auth-redirect';

const HEADER_PATH = new URL('../components/organisms/Header.astro', import.meta.url);
const HERO_PATH = new URL('../components/organisms/Hero.astro', import.meta.url);
const CTA_PATH = new URL('../components/organisms/CTA.astro', import.meta.url);
const SIGNUP_PLAN_PATH = new URL('../pages/auth/signup/plan.astro', import.meta.url);

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
    `Expected CTA "${ctaText}" to keep the compatibility href="/auth/signup/plan" in ${sourceName}.`
  ).toBe(true);
}

describe('Contract: landing CTA routing to signup', () => {
  it('navbar CTA "Crear cuenta" points to /auth/signup/plan compatibility hop', async () => {
    const source = await readFile(HEADER_PATH, 'utf8');

    expectAnchorCtaToSignup(source, 'Crear cuenta', 'Header.astro');
  });

  it('hero CTA "Empezar ahora" points to /auth/signup/plan compatibility hop', async () => {
    const source = await readFile(HERO_PATH, 'utf8');

    expectAnchorCtaToSignup(source, 'Empezar ahora', 'Hero.astro');
  });

  it('final CTA "Probalo hoy" points to /auth/signup/plan compatibility hop', async () => {
    const source = await readFile(CTA_PATH, 'utf8');

    expectAnchorCtaToSignup(source, 'Probalo hoy', 'CTA.astro');
  });

  it('landing /auth/signup/plan redirects into dashboard in-app signup', async () => {
    const source = await readFile(SIGNUP_PLAN_PATH, 'utf8');

    expect(source).toMatch(/buildInAppAuthRedirect/);
    expect(source).toMatch(/Astro\.redirect/);
    expect(source).toMatch(/['"]signup['"]/);

    const redirect = new URL(
      buildInAppAuthRedirect(new URL('https://orvel.pro/auth/signup/plan'), 'signup')
    );
    expect(redirect.origin).toBe('https://dashboard.orvel.pro');
    expect(redirect.pathname).toBe('/dashboard/auth/signup');
  });
});
