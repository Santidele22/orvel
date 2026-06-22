import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const ONBOARDING_PAGE_PATH = new URL('../../features/onboarding/pages/signup-business-types-step.page.ts', import.meta.url);
const ONBOARDING_TEMPLATE_PATH = new URL('../../features/onboarding/pages/signup-business-types-step.page.html', import.meta.url);
const DASHBOARD_HOME_TEMPLATE_PATH = new URL('../../features/dashboard-home/pages/dashboard-home.page.html', import.meta.url);
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
    expect(source).toMatch(/from\(['"]business_settings['"]\)[\s\S]*\.upsert[\s\S]*business_type:\s*defaults\.businessType/);
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

  it('paid plans do not show the hidden branch/add-on prompt and go directly to true welcome', async () => {
    const source = await loadSource(ONBOARDING_PAGE_PATH);

    expect(source).not.toMatch(/shouldOfferPaidAddon|openPaidAddonStep|showPaidAddonModal\s*=\s*true/i);
    expect(source).not.toMatch(/skip.*Branch|saltar.*Sucursal|omitir.*sucursal|extra.*branch/i);
    expect(source).toMatch(/setCurrentStep\(storage, ['"]welcome['"]\)/);
    expect(source.indexOf('persistMandatoryOnboarding')).toBeLessThan(source.indexOf('openWelcomeStep'));
  });

  it('keeps service selection and welcome as the only onboarding UI states while branch/add-on UI is hidden', async () => {
    const source = await loadSource(ONBOARDING_PAGE_PATH);
    const template = await readFile(
      ONBOARDING_TEMPLATE_PATH,
      'utf8'
    );

    expect(template).toMatch(/@if\s*\([^)]*isSelectionStep\(\)/);
    expect(template).toMatch(/@if\s*\([^)]*showWelcomeModal/);
    expect(template).not.toMatch(/showPaidAddonModal|extra-branch-modal|paid.*addon|sucursal adicional|multi-branch/i);
    expect(template.indexOf('business-types-grid')).toBeLessThan(template.indexOf('welcome-modal'));
    expect(source).toMatch(/isSelectionStep\(\)/);
  });

  it('fires canvas-confetti only from the true welcome success state after successful completion', async () => {
    const source = await loadSource(ONBOARDING_PAGE_PATH);
    const packageJson = await readFile(new URL('../../../../package.json', import.meta.url), 'utf8');

    expect(packageJson).toMatch(/"canvas-confetti"/);
    expect(source).toMatch(/canvas-confetti/);
    expect(source).toMatch(/triggerWelcomeConfetti/);
    expect(source.indexOf('openWelcomeStep')).toBeLessThan(source.indexOf('triggerWelcomeConfetti'));
    expect(source.indexOf('persistMandatoryOnboarding')).toBeLessThan(source.indexOf('triggerWelcomeConfetti'));
    expect(source).not.toMatch(/showPaidAddonModal\s*=\s*true/);
  });

  it('keeps the welcome modal accessible with labelled and described dialog copy', async () => {
    const template = await loadSource(ONBOARDING_TEMPLATE_PATH);

    expect(template).toMatch(/<section[^>]*class=["'][^"']*welcome-modal[^"']*["'][^>]*role=["']dialog["'][^>]*aria-modal=["']true["']/);
    expect(template).toMatch(/aria-labelledby=["']welcome-title["']/);
    expect(template).toMatch(/aria-describedby=["']welcome-description["']/);
    expect(template).toMatch(/<p[^>]*id=["']welcome-description["']/);
    expect(template).toMatch(/data-testid=["']onboarding-welcome-primary-action["']/);
  });

  it('opens the welcome state without blocking when reduced motion disables confetti', async () => {
    const { SignupBusinessTypesStepPage } = await import('../../features/onboarding/pages/signup-business-types-step.page');
    const catalogModule = await import('../../core/catalog/reference-catalog');
    const gatewayModule = await import('../../core/catalog/reference-catalog.gateway');
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
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true })
    });

    gatewayModule.initializeRuntimeReferenceCatalogSnapshot(catalogModule.DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE);
    gatewayModule.configureDashboardReferenceCatalogGateway({
      async getDashboardReferenceCatalog() {
        return catalogModule.DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE;
      }
    });

    try {
      const component = new SignupBusinessTypesStepPage() as SignupBusinessTypesStepPage & {
        showWelcomeModal: boolean;
        showPaidAddonModal: boolean;
      };
      component.setOnboardingCompletionHandler(async () => true);
      component.toggleType('peluqueria');

      await component.submitAsync();

      expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
      expect(component.showWelcomeModal).toBe(true);
      expect(component.showPaidAddonModal).toBe(false);
      expect(storage.get('turnea.onboarding.step.v1')).toBe('welcome');
    } finally {
      gatewayModule.configureDashboardReferenceCatalogGateway(null);
      gatewayModule.initializeRuntimeReferenceCatalogSnapshot(catalogModule.DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE);
    }
  });

  it('allows exactly one service type for every plan and replaces the prior selection', async () => {
    const { SignupBusinessTypesStepPage } = await import('../../features/onboarding/pages/signup-business-types-step.page');

    for (const plan of ['FREE', 'STARTER', 'GROWTH', 'PRO']) {
      const storage = new Map<string, string>([['turnea.onboarding.plan', plan]]);
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
          removeItem: (key: string) => storage.delete(key)
        }
      });

      const component = new SignupBusinessTypesStepPage();
      expect(component.getMaxTypes()).toBe(1);

      component.toggleType('peluqueria');
      component.toggleType('spa');

      expect(component.selectedTypes).toEqual(['spa']);
    }
  });

  it('Complete Registration is first-click reliable, enters loading, and ignores duplicate clicks', async () => {
    const { SignupBusinessTypesStepPage } = await import('../../features/onboarding/pages/signup-business-types-step.page');
    const storage = new Map<string, string>([['turnea.onboarding.plan', 'FREE']]);
    let calls = 0;
    let resolvePersist!: (value: boolean) => void;
    const pendingPersist = new Promise<boolean>((resolve) => {
      resolvePersist = resolve;
    });

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });
    Object.defineProperty(window, 'dispatchEvent', { configurable: true, value: () => true });

    const component = new SignupBusinessTypesStepPage();
    component.setOnboardingCompletionHandler(async () => {
      calls += 1;
      return pendingPersist;
    });
    component.toggleType('peluqueria');

    const firstSubmit = component.submitAsync();
    const secondSubmit = component.submitAsync();

    expect(component.canContinue()).toBe(false);
    expect(calls).toBe(1);

    resolvePersist(true);
    await Promise.all([firstSubmit, secondSubmit]);
    expect(calls).toBe(1);
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

    expect(component.showWelcomeModal).toBe(true);
    expect(component.showPaidAddonModal).toBe(false);
  });

  it('FREE welcome continues to dashboard, never login or paid branch prompt', async () => {
    const { SignupBusinessTypesStepPage } = await import('../../features/onboarding/pages/signup-business-types-step.page');
    const storage = new Map<string, string>([['turnea.onboarding.plan', 'FREE']]);
    const navigations: string[] = [];

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });
    Object.defineProperty(window, 'dispatchEvent', { configurable: true, value: () => true });

    const component = new SignupBusinessTypesStepPage();
    component.setRouter({ navigateByUrl: (url: string) => navigations.push(url) });
    component.setOnboardingCompletionHandler(async () => true);
    component.toggleType('peluqueria');

    await component.submitAsync();
    component.continueAfterWelcome();

    expect(component.showPaidAddonModal).toBe(false);
    expect(navigations).toEqual(['/dashboard/inicio']);
    expect(navigations).not.toContain('/auth/login');
  });

  it('paid plan opens welcome/dashboard path directly without branch skip step or login', async () => {
    const { SignupBusinessTypesStepPage } = await import('../../features/onboarding/pages/signup-business-types-step.page');
    const storage = new Map<string, string>([['turnea.onboarding.plan', 'PRO']]);
    const navigations: string[] = [];

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });
    Object.defineProperty(window, 'dispatchEvent', { configurable: true, value: () => true });

    const component = new SignupBusinessTypesStepPage();
    component.setRouter({ navigateByUrl: (url: string) => navigations.push(url) });
    component.setOnboardingCompletionHandler(async () => true);
    component.toggleType('peluqueria');

    await component.submitAsync();
    expect(component.showWelcomeModal).toBe(true);
    expect(component.showPaidAddonModal).toBe(false);
    component.continueAfterWelcome();

    expect(navigations).toEqual(['/dashboard/inicio']);
    expect(navigations).not.toContain('/auth/login');
    expect(storage.get('turnea.onboarding.paid_addon_skipped')).toBeUndefined();
  });

  it('welcome copy and action avoid email promises and legacy ugly button styling', async () => {
    const template = await loadSource(ONBOARDING_TEMPLATE_PATH);

    expect(template).not.toMatch(/email|correo|mail/i);
    expect(template).toMatch(/data-testid=["']onboarding-welcome-primary-action["']/);
    expect(template).toMatch(/class=["'][^"']*(?:btn-welcome-primary|welcome-primary-action|orvel-primary-action)/);
  });

  it('dashboard home removes the green onboarding completion cue', async () => {
    const template = await loadSource(DASHBOARD_HOME_TEMPLATE_PATH);

    expect(template).not.toMatch(/showOnboardingCue|onboarding.*completo|Bienvenida\/o/i);
    expect(template).not.toMatch(/emerald-500\/10|text-emerald-300|border-emerald-500/);
  });

  it('does not implement guided tour entrypoints in this correction slice', async () => {
    const onboardingSource = await loadSource(ONBOARDING_PAGE_PATH);
    const onboardingTemplate = await loadSource(ONBOARDING_TEMPLATE_PATH);
    const dashboardTemplate = await loadSource(DASHBOARD_HOME_TEMPLATE_PATH);

    expect(`${onboardingSource}\n${onboardingTemplate}\n${dashboardTemplate}`).not.toMatch(
      /guided tour|tour guiado|startGuidedTour|onboarding-tour|product-tour/i
    );
  });

  it('honors ?plan=FREE on dashboard onboarding entry and persists FREE instead of STARTER', async () => {
    const { SignupBusinessTypesStepPage } = await import('../../features/onboarding/pages/signup-business-types-step.page');
    const storage = new Map<string, string>();
    let capturedPlan: unknown = null;

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('http://localhost:3000/auth/onboarding?plan=FREE')
    });
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });
    Object.defineProperty(window, 'dispatchEvent', { configurable: true, value: () => true });

    const component = new SignupBusinessTypesStepPage();
    component.setOnboardingCompletionHandler(async ({ plan }) => {
      capturedPlan = plan;
      return true;
    });
    component.toggleType('peluqueria');

    await component.submitAsync();

    expect(capturedPlan).toBe('FREE');
    expect(storage.get('turnea.onboarding.plan')).toBe('FREE');
  });

  it('does not invent STARTER or FREE when dashboard onboarding submits without a valid selected plan', async () => {
    const { SignupBusinessTypesStepPage } = await import('../../features/onboarding/pages/signup-business-types-step.page');
    const storage = new Map<string, string>();
    const completionHandler = vi.fn(async () => true);

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('http://localhost:3000/auth/onboarding')
    });
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });
    Object.defineProperty(window, 'dispatchEvent', { configurable: true, value: () => true });

    const component = new SignupBusinessTypesStepPage();
    component.setOnboardingCompletionHandler(completionHandler);
    component.toggleType('peluqueria');

    await component.submitAsync();

    expect(completionHandler).not.toHaveBeenCalled();
    expect(storage.get('turnea.onboarding.plan')).toBeUndefined();
  });

  it('does not normalize an invalid onboarding URL plan into a persisted FREE/STARTER plan', async () => {
    const { SignupBusinessTypesStepPage } = await import('../../features/onboarding/pages/signup-business-types-step.page');
    const storage = new Map<string, string>();
    const completionHandler = vi.fn(async () => true);

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('http://localhost:3000/auth/onboarding?plan=NOT_A_PLAN')
    });
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });
    Object.defineProperty(window, 'dispatchEvent', { configurable: true, value: () => true });

    const component = new SignupBusinessTypesStepPage();
    component.setOnboardingCompletionHandler(completionHandler);
    component.toggleType('peluqueria');

    await component.submitAsync();

    expect(completionHandler).not.toHaveBeenCalled();
    expect(storage.get('turnea.onboarding.plan')).toBeUndefined();
  });

  it('registers only dashboard onboarding before protected dashboard home', async () => {
    const routesSource = await loadSource(ROUTES_PATH);

    expect(routesSource).toContain("path: 'auth/onboarding'");
    expect(routesSource).not.toMatch(/path:\s*['"]auth\/signup\/(?:plan|credentials|complete|welcome)['"]/);
    expect(routesSource.indexOf("path: 'auth/onboarding'")).toBeLessThan(routesSource.indexOf("path: 'dashboard'"));
  });
});
