import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const HEADER_PATH = new URL('../components/organisms/Header.astro', import.meta.url);
const HERO_PATH = new URL('../components/organisms/Hero.astro', import.meta.url);
const CTA_PATH = new URL('../components/organisms/CTA.astro', import.meta.url);
const PRICING_PATH = new URL('../components/organisms/Pricing.astro', import.meta.url);
const PLAN_CARD_PATH = new URL('../components/molecules/PlanCard.astro', import.meta.url);
const INDEX_PATH = new URL('../pages/index.astro', import.meta.url);
const LOGIN_PATH = new URL('../pages/auth/login.astro', import.meta.url);
const CALLBACK_PATH = new URL('../pages/auth/callback.astro', import.meta.url);
const AUTH_RETURN_TO_PATH = new URL('../lib/auth-return-to.ts', import.meta.url);

type AuthReturnToModule = {
  sanitizeLandingAuthReturnTo: (
    raw: string | null | undefined,
    options: { currentOrigin: string; dashboardBaseUrl?: string | null }
  ) => string;
};

async function source(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

async function loadAuthReturnTo(): Promise<AuthReturnToModule> {
  return (await import(AUTH_RETURN_TO_PATH.href)) as AuthReturnToModule;
}

function expectVisibleAnchorTo(sourceText: string, label: RegExp, href: string): void {
  expect(sourceText).toMatch(new RegExp(`<a[^>]+href=["']${href}["'][^>]*>[\\s\\S]*${label.source}[\\s\\S]*<\\/a>`, 'i'));
}

describe('RED Contract: active launch landing account/auth actions', () => {
  it('renders a visible navbar login link to the canonical landing auth page', async () => {
    const header = await source(HEADER_PATH);

    expectVisibleAnchorTo(header, /Iniciar sesión/, '/auth/login');
    expect(header).not.toMatch(/dashboard-auth|buildDashboardAuthUrl|\/login-dashboard/i);
  });

  it('renders active hero account-start CTAs instead of pre-launch informational-only copy', async () => {
    const hero = await source(HERO_PATH);

    expect(hero).toMatch(/Nueva versión|Disponible/i);
    expectVisibleAnchorTo(hero, /Comenzar|Empezar|Crear cuenta/, '/auth/signup/plan');
    expect(hero).not.toMatch(/versión 1\.0 próximamente/i);
  });

  it('mounts the final CTA section and wires its primary action to account creation', async () => {
    const index = await source(INDEX_PATH);
    const cta = await source(CTA_PATH);

    expect(index).toMatch(/<CTA\s*\/>/);
    expect(index).not.toMatch(/<!--\s*<CTA\s*\/>\s*-->/);
    expectVisibleAnchorTo(cta, /Activar|Comenzar|Empezar|Crear cuenta/, '/auth/signup/plan');
  });
});

describe('RED Contract: active launch landing plan selection uses subscription/preapproval flow', () => {
  it('renders selectable plan CTAs on pricing cards and never leaves launch pricing as coming soon', async () => {
    const planCard = await source(PLAN_CARD_PATH);
    const pricing = await source(PRICING_PATH);

    for (const plan of ['STARTER', 'GROWTH', 'PRO']) {
      expect(planCard).toContain(`data-plan={plan.code}`);
      expect(planCard).toMatch(new RegExp(`Elegir\\s+${plan}`, 'i'));
    }

    expect(`${pricing}\n${planCard}`).not.toMatch(/Disponible próximamente/i);
  });

  it('routes paid plan selection into current subscription/preapproval billing, not legacy checkout', async () => {
    const index = await source(INDEX_PATH);
    const pricing = await source(PRICING_PATH);
    const planCard = await source(PLAN_CARD_PATH);
    const activeLandingSources = `${index}\n${pricing}\n${planCard}`;

    expect(index).toMatch(/function\s+handlePlanSelection|const\s+handlePlanSelection/);
    expect(index).toContain('/auth/login');
    expect(index).toContain('/billing/subscription');
    expect(index).toMatch(/plan=\$\{?planCode\}?|planCode/);
    expect(index).not.toContain('/auth/login?plan=${planCode}&returnTo=/auth/signup/plan');

    expect(activeLandingSources).not.toMatch(/\/api\/checkout|test-checkout|Comprar ahora/i);
    expect(activeLandingSources).not.toMatch(/checkout[_-]?session/i);
  });

  it('keeps the multi-sucursal add-on price and sends add-on intent through subscription billing', async () => {
    const pricing = await source(PRICING_PATH);

    expect(pricing).toMatch(/Multi-sucursal/i);
    expect(pricing).toMatch(/\+\$20\.000|20000/);
    expect(pricing).toMatch(/\/auth\/login\?returnTo=\/billing\/subscription/);
  });

  it('preserves paid plan subscription returnTo through login and OAuth callback sanitization', async () => {
    const login = await source(LOGIN_PATH);
    const callback = await source(CALLBACK_PATH);
    const { sanitizeLandingAuthReturnTo } = await loadAuthReturnTo();

    const paidPlanReturnTo = '/billing/subscription?plan=STARTER';

    expect(sanitizeLandingAuthReturnTo(paidPlanReturnTo, { currentOrigin: 'https://orvel.pro' })).toBe(paidPlanReturnTo);
    expect(sanitizeLandingAuthReturnTo(`/auth/callback?returnTo=${encodeURIComponent(paidPlanReturnTo)}`, { currentOrigin: 'https://orvel.pro' })).toBe('/dashboard/inicio');
    expect(sanitizeLandingAuthReturnTo('/billing/subscription?plan=STARTER&code=oauth-code', { currentOrigin: 'https://orvel.pro' })).toBe('/dashboard/inicio');
    expect(sanitizeLandingAuthReturnTo('https://evil.example/billing/subscription?plan=STARTER', { currentOrigin: 'https://orvel.pro' })).toBe('/dashboard/inicio');

    expect(login).toContain('sanitizeLandingAuthReturnTo');
    expect(callback).toContain('sanitizeLandingAuthReturnTo');
  });
});
