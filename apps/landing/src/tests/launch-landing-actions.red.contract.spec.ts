import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const HEADER_PATH = new URL('../components/organisms/Header.astro', import.meta.url);
const HERO_PATH = new URL('../components/organisms/Hero.astro', import.meta.url);
const CTA_PATH = new URL('../components/organisms/CTA.astro', import.meta.url);
const PRICING_PATH = new URL('../components/organisms/Pricing.astro', import.meta.url);
const PLAN_CARD_PATH = new URL('../components/molecules/PlanCard.astro', import.meta.url);
const INDEX_PATH = new URL('../pages/lanzamiento.astro', import.meta.url);
const LOGIN_PATH = new URL('../pages/auth/login.astro', import.meta.url);
const LOGIN_CONTROLLER_PATH = new URL('../lib/login-page-controller.ts', import.meta.url);
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
    expectVisibleAnchorTo(cta, /Activar|Comenzar|Empezar|Crear cuenta|Probalo hoy/, '/auth/signup/plan');
  });
});

describe('RED Contract: active launch landing plan selection uses subscription/preapproval flow', () => {
  it('renders selectable plan CTAs on pricing cards and never leaves launch pricing as coming soon', async () => {
    const planCard = await source(PLAN_CARD_PATH);
    const pricing = await source(PRICING_PATH);

    for (const [plan, label] of [['FREE', 'Empezar gratis'], ['PREMIUM', 'Elegir Premium']] as const) {
      expect(planCard).toContain(`data-plan={plan.code}`);
      expect(planCard).toMatch(new RegExp(label.replace(/\s+/g, '\\s+'), 'i'));
    }

    expect(`${pricing}\n${planCard}`).not.toMatch(/Disponible próximamente/i);
  });

  it('routes paid plan selection into current subscription/preapproval billing, not legacy checkout', async () => {
    const index = await source(INDEX_PATH);
    const pricing = await source(PRICING_PATH);
    const planCard = await source(PLAN_CARD_PATH);
    const activeLandingSources = `${index}\n${pricing}\n${planCard}`;

    expect(index).toMatch(/function\s+handlePlanSelection|const\s+handlePlanSelection/);
    expect(index).toContain('/auth/signup/credentials');
    expect(index).toContain('/billing/subscription');
    expect(index).toMatch(/plan=\$\{?planCode\}?|planCode/);
    expect(index).not.toContain('/auth/login?plan=${planCode}&returnTo=/auth/signup/plan');

    expect(activeLandingSources).not.toMatch(/\/api\/checkout|test-checkout|Comprar ahora/i);
    expect(activeLandingSources).not.toMatch(/checkout[_-]?session/i);
  });

  it('defers multi-sucursal outside the production MVP instead of selling it as a live billing add-on', async () => {
    const index = await source(INDEX_PATH);
    const pricing = await source(PRICING_PATH);
    const planCard = await source(PLAN_CARD_PATH);
    const activeLandingSources = `${index}\n${pricing}\n${planCard}`;

    expect(activeLandingSources).not.toMatch(/\bAdd-on\b|Multi-sucursal disponible como add-on/i);
    expect(activeLandingSources).not.toMatch(/\+\s*\$?\s*(?:20\.000|20000)\s*(?:\/mes|por mes)?/i);
    expect(activeLandingSources).not.toMatch(/Sumar sucursal|Comprar sucursal|Agregar sucursal|Contratar multi-sucursal/i);
    expect(activeLandingSources).not.toMatch(/billing\/subscription[^\s"'<>]*(?:addon|add-on|multi-?sucursal|sucursal-adicional|local-adicional)/i);
  });

  it('preserves paid plan subscription returnTo through email/password login sanitization', async () => {
    const login = await source(LOGIN_PATH);
    const loginController = await source(LOGIN_CONTROLLER_PATH);
    const { sanitizeLandingAuthReturnTo } = await loadAuthReturnTo();

    const paidPlanReturnTo = '/billing/subscription?plan=PREMIUM';

    expect(sanitizeLandingAuthReturnTo(paidPlanReturnTo, { currentOrigin: 'https://orvel.pro' })).toBe(paidPlanReturnTo);
    expect(sanitizeLandingAuthReturnTo('/billing/subscription?plan=PREMIUM&code=auth-code', { currentOrigin: 'https://orvel.pro' })).toBe('https://dashboard.orvel.pro/dashboard/inicio');
    expect(sanitizeLandingAuthReturnTo('https://evil.example/billing/subscription?plan=PREMIUM', { currentOrigin: 'https://orvel.pro' })).toBe('https://dashboard.orvel.pro/dashboard/inicio');
    expect(sanitizeLandingAuthReturnTo(null, { currentOrigin: 'https://orvel.pro' })).toBe('https://dashboard.orvel.pro/dashboard/inicio');
    expect(sanitizeLandingAuthReturnTo('/dashboard/inicio', { currentOrigin: 'https://orvel.pro' })).toBe('https://dashboard.orvel.pro/dashboard/inicio');
    expect(sanitizeLandingAuthReturnTo('/dashboard/inicio', { currentOrigin: 'http://localhost:4321' })).toBe('http://localhost:4200/dashboard/inicio');
    expect(sanitizeLandingAuthReturnTo('/dashboard/inicio', { currentOrigin: 'https://orvel.pro', dashboardBaseUrl: 'https://app.orvel.pro/dashboard' })).toBe('https://app.orvel.pro/dashboard/inicio');
    expect(sanitizeLandingAuthReturnTo('/dashboard/turnos?view=week', { currentOrigin: 'http://localhost:4321' })).toBe('http://localhost:4200/dashboard/turnos?view=week');
    expect(sanitizeLandingAuthReturnTo('/dashboard/turnos?view=week', { currentOrigin: 'https://orvel.pro', dashboardBaseUrl: 'https://app.orvel.pro/dashboard' })).toBe('https://app.orvel.pro/dashboard/turnos?view=week');

    expect(login).toContain("import { buildInAppAuthRedirect } from '../../lib/in-app-auth-redirect'");
    expect(login).toContain("buildInAppAuthRedirect(Astro.url, 'login', import.meta.env.PUBLIC_DASHBOARD_URL)");
    expect(login).toMatch(/Astro\.redirect\([\s\S]*302/);
    expect(login).not.toContain('initLoginPage');
    expect(loginController).toContain('sanitizeLandingAuthReturnTo');
    expect(loginController).toContain('attempt: { email, password, returnTo }');
  });
});
