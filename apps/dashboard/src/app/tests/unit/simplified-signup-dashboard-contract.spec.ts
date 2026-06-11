import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const ONBOARDING_PAGE_PATH = new URL('../../features/onboarding/pages/signup-business-types-step.page.ts', import.meta.url);
const ROUTES_PATH = new URL('../../app.routes.ts', import.meta.url);

async function loadSource(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

describe('Contract: simplified signup dashboard onboarding gate', () => {
  it('dashboard owns business-type onboarding and persists all dashboard-required artifacts before welcome/dashboard', async () => {
    const source = await loadSource(ONBOARDING_PAGE_PATH);

    expect(source).toContain('createSupabaseOnboardingCompletionHandler');
    expect(source).toMatch(/from\(['"]businesses['"]\)[\s\S]*\.upsert/);
    expect(source).toMatch(/from\(['"]business_settings['"]\)[\s\S]*\.upsert/);
    expect(source).toMatch(/auth\.updateUser[\s\S]*onboardingCompleted[\s\S]*true/);
    expect(source).toMatch(/business_type|tipoNegocio|businessType/);
    expect(source).toMatch(/setCurrentStep\(storage, ['"]welcome['"]\)/);
    expect(source).not.toMatch(/navigateByUrl\(['"]\/dashboard\/inicio['"]\)[\s\S]{0,800}(business_settings|auth\.updateUser)/);
  });

  it('FREE plan never opens an extra branch modal before welcome/dashboard', async () => {
    const source = await loadSource(ONBOARDING_PAGE_PATH);
    const freeBranch = source.match(/plan[^\n]+FREE[\s\S]{0,1200}/i)?.[0] ?? source;

    expect(freeBranch).not.toMatch(/branch|sucursal|local adicional|multi-branch/i);
    expect(source).toMatch(/setCurrentStep\(storage, ['"]welcome['"]\)/);
  });

  it('paid plans show any extra branch modal only after onboarding completion and allow skipping to welcome', async () => {
    const source = await loadSource(ONBOARDING_PAGE_PATH);

    expect(source).toMatch(/show.*Branch|branch.*Modal|sucursal.*modal|extra.*branch/i);
    expect(source).toMatch(/skip.*Branch|saltar.*Sucursal|omitir.*sucursal/i);
    expect(source.indexOf('persistMandatoryOnboarding')).toBeLessThan(
      Math.max(source.search(/show.*Branch|branch.*Modal|sucursal.*modal|extra.*branch/i), 0)
    );
    expect(source).toMatch(/setCurrentStep\(storage, ['"]welcome['"]\)/);
  });

  it('keeps service selection, welcome, and paid branch prompt as visually separate onboarding states', async () => {
    const source = await loadSource(ONBOARDING_PAGE_PATH);
    const template = await readFile(
      new URL('../../features/onboarding/pages/signup-business-types-step.page.html', import.meta.url),
      'utf8'
    );

    expect(template).toMatch(/@if\s*\([^)]*isSelectionStep\(\)/);
    expect(template).toMatch(/@if\s*\([^)]*showWelcomeModal/);
    expect(template).toMatch(/@if\s*\([^)]*showPaidAddonModal/);
    expect(template.indexOf('business-types-grid')).toBeLessThan(template.indexOf('welcome-modal'));
    expect(template.indexOf('welcome-modal')).toBeLessThan(template.indexOf('extra-branch-modal'));
    expect(source).toMatch(/isSelectionStep\(\)/);
  });

  it('uses canvas-confetti for the standalone welcome success state', async () => {
    const source = await loadSource(ONBOARDING_PAGE_PATH);
    const packageJson = await readFile(new URL('../../../../package.json', import.meta.url), 'utf8');

    expect(packageJson).toMatch(/"canvas-confetti"/);
    expect(source).toMatch(/canvas-confetti/);
    expect(source).toMatch(/triggerWelcomeConfetti/);
    expect(source.indexOf('openWelcomeStep')).toBeLessThan(source.indexOf('triggerWelcomeConfetti'));
  });

  it('FREE users enter from welcome without seeing the paid branch prompt', async () => {
    const { SignupBusinessTypesStepPage } = await import('../../features/onboarding/pages/signup-business-types-step.page');
    const storage = new Map<string, string>([['turnea.onboarding.plan', 'FREE']]);

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });
    Object.defineProperty(window, 'dispatchEvent', { configurable: true, value: () => true });

    const component = new SignupBusinessTypesStepPage() as SignupBusinessTypesStepPage & {
      showWelcomeModal: boolean;
      showPaidAddonModal: boolean;
      continueAfterWelcome(): void;
    };
    component.setOnboardingCompletionHandler(async () => true);
    component.toggleType('peluqueria');

    await component.submitAsync();
    component.continueAfterWelcome();

    expect(component.showWelcomeModal).toBe(true);
    expect(component.showPaidAddonModal).toBe(false);
  });

  it('registers dashboard onboarding and welcome routes before protected dashboard home', async () => {
    const routesSource = await loadSource(ROUTES_PATH);

    expect(routesSource).toContain("path: 'auth/onboarding'");
    expect(routesSource).toMatch(/path:\s*['"]auth\/signup\/welcome['"]/);
    expect(routesSource.indexOf("path: 'auth/onboarding'")).toBeLessThan(routesSource.indexOf("path: 'dashboard'"));
  });
});
