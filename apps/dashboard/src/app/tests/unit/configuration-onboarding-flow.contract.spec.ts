import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const ROUTES_PATH = new URL('../../app.routes.ts', import.meta.url);
const ONBOARDING_STATE_PATH = new URL('../../features/onboarding/data-access/onboarding-flow-state.ts', import.meta.url);
const ONBOARDING_PAGE_PATH = new URL('../../features/onboarding/pages/signup-business-types-step.page.ts', import.meta.url);
const ONBOARDING_TEMPLATE_PATH = new URL('../../features/onboarding/pages/signup-business-types-step.page.html', import.meta.url);

async function load(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

describe('Contract: dashboard configuration-only onboarding', () => {
  it('exposes only /auth/onboarding for dashboard onboarding and removes legacy dashboard signup routes', async () => {
    const routesSource = await load(ROUTES_PATH);

    expect(routesSource).toMatch(/path:\s*['"]auth\/onboarding['"]/);
    expect(routesSource).not.toMatch(/path:\s*['"]auth\/signup\/(?:plan|credentials|complete|welcome)['"]/);
    expect(routesSource).not.toContain('SignupCredentialsPageComponent');
    expect(routesSource.indexOf("path: 'auth/onboarding'")).toBeLessThan(routesSource.indexOf("path: 'dashboard'"));
  });

  it('protects /auth/onboarding with the Supabase dashboard session guard, not local account-method storage', async () => {
    const routesSource = await load(ROUTES_PATH);
    const onboardingRoute = routesSource.match(/path:\s*['"]auth\/onboarding['"][\s\S]*?(?=\n\s*\},\n\s*\{)/)?.[0] ?? '';

    expect(onboardingRoute).toContain('canActivate');
    expect(onboardingRoute).toContain('dashboardAuthGuard');
    expect(onboardingRoute).not.toContain('onboardingAccountGuard');
    expect(onboardingRoute).not.toContain('onboardingBusinessTypesGuard');
    expect(onboardingRoute).not.toContain('onboardingWelcomeGuard');

    const stateSource = await load(ONBOARDING_STATE_PATH);
    expect(stateSource).not.toContain('turnea.onboarding.account-method.v1');
    expect(stateSource).not.toMatch(/ONBOARDING_ACCOUNT_METHOD_KEY|hasValidAccountMethod|accountMethod/);
  });

  it('uses configuration language and removes account-creation copy from dashboard onboarding UI', async () => {
    const template = await load(ONBOARDING_TEMPLATE_PATH);

    expect(template).toMatch(/Guardar configuración|Guardando configuración|Configuración guardada/i);
    expect(template).not.toMatch(/Crear cuenta|Cuenta creada|Completar registro|email/i);
  });

  it('back action from configuration onboarding is route-safe and never returns to signup credentials', async () => {
    const pageSource = await load(ONBOARDING_PAGE_PATH);

    expect(pageSource).not.toContain('/auth/signup/credentials');
    expect(pageSource).not.toMatch(/Navigate to credentials|signup-credentials/i);
  });
});
