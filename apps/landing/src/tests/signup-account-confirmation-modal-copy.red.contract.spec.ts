import { describe, expect, it } from 'vitest';

const SIGNUP_ACCOUNT_PAGE = new URL('../pages/auth/signup/account.astro', import.meta.url);

async function readSource(url: URL): Promise<string> {
  return await import('node:fs/promises').then(({ readFile }) => readFile(url, 'utf8'));
}

function accountCreatedModalSlice(source: string): string {
  const start = source.indexOf('id="accountCreatedModal"');
  expect(start, 'accountCreatedModal must be present in signup account page').toBeGreaterThan(0);

  const afterModal = source.indexOf('</div>\n        </div>', start);
  expect(afterModal, 'accountCreatedModal markup must be inspectable').toBeGreaterThan(start);

  return source.slice(start, afterModal);
}

describe('RED signup account confirmation modal copy contract', () => {
  it('uses confirmation-first Spanish copy and does not claim account/business creation is complete', async () => {
    const source = await readSource(SIGNUP_ACCOUNT_PAGE);
    const modal = accountCreatedModalSlice(source);

    expect(modal).toMatch(/Gracias\s+por\s+dar\s+el\s+paso/i);
    expect(modal).toMatch(/se\s+te\s+enviar[áa]\s+un\s+email[\s\S]{0,120}confirmar\s+la\s+cuenta/i);
    expect(modal).not.toMatch(/Tu\s+cuenta\s+est[áa]\s+lista/i);
    expect(modal).not.toMatch(/Ya\s+creamos\s+tu\s+cuenta/i);
  });

  it('uses Orvel dark/violet modal styling instead of generic blue SaaS utilities', async () => {
    const source = await readSource(SIGNUP_ACCOUNT_PAGE);
    const modal = accountCreatedModalSlice(source);

    expect(modal).toMatch(/bg-bg-primary\/85/);
    expect(modal).toMatch(/bg-bg-secondary\/95/);
    expect(modal).toMatch(/border-primary\/25|border-primary\/20/);
    expect(modal).toMatch(/text-text-primary/);
    expect(modal).toMatch(/text-text-secondary/);
    expect(modal).toMatch(/bg-primary/);
    expect(modal).toMatch(/hover:bg-primary-hover/);
    expect(modal).toMatch(/focus:ring-primary\/60/);
    expect(modal).not.toMatch(/\bbg-white\b|\bbg-blue-\d+\b|\btext-blue-\d+\b|\bborder-blue-\d+\b|\bring-blue-\d+\b|\bhover:bg-blue-\d+\b/);
  });
});
