import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE } from '../../core/catalog/reference-catalog';
import { initializeRuntimeReferenceCatalogSnapshot } from '../../core/catalog/reference-catalog.gateway';
import { InAppSignupWizard } from '../../features/auth/in-app-signup-wizard';

const WIZARD_PAGE = new URL('../../features/auth/pages/in-app-signup-wizard.page.ts', import.meta.url);
const LOGIN_PAGE = new URL('../../features/auth/pages/in-app-login.page.ts', import.meta.url);

describe('Contract: in-app signup wizard (#562)', () => {
  initializeRuntimeReferenceCatalogSnapshot(DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE);

  it('disables identity continue until owner name and business name are both non-empty', () => {
    const wizard = new InAppSignupWizard();

    expect(wizard.step).toBe(1);
    expect(wizard.canContinue()).toBe(false);

    wizard.ownerName = 'Santi';
    expect(wizard.canContinue()).toBe(false);

    wizard.businessName = 'Studio Norte';
    expect(wizard.canContinue()).toBe(true);

    wizard.continue();
    expect(wizard.step).toBe(2);
  });

  it('requires at least one rubro and treats the first selected as principal', () => {
    const wizard = new InAppSignupWizard();
    wizard.ownerName = 'Santi';
    wizard.businessName = 'Studio Norte';
    wizard.continue();

    expect(wizard.canContinue()).toBe(false);
    wizard.toggleRubro('unas');
    wizard.toggleRubro('peluqueria');

    expect(wizard.canContinue()).toBe(true);
    expect(wizard.selectedRubros[0]).toBe('unas');
    expect(wizard.principalRubro()).toBe('unas');
  });

  it('rejects password shorter than 8 characters or a mismatch before creating the Free account', () => {
    const wizard = new InAppSignupWizard();
    wizard.ownerName = 'Santi';
    wizard.businessName = 'Studio Norte';
    wizard.continue();
    wizard.toggleRubro('peluqueria');
    wizard.continue();

    wizard.email = 'santi@example.com';
    wizard.password = '1234567';
    wizard.confirmPassword = '1234567';
    expect(wizard.canContinue()).toBe(false);

    wizard.password = '12345678';
    wizard.confirmPassword = '12345679';
    expect(wizard.canContinue()).toBe(false);

    wizard.confirmPassword = '12345678';
    expect(wizard.canContinue()).toBe(true);

    const payload = wizard.buildCreateAccountPayload();
    expect(payload.plan).toBe('FREE');
    expect(payload.nombre).toBe('Santi');
    expect(payload.negocioNombre).toBe('Studio Norte');
    expect(payload.rubro).toBe('peluqueria');
    expect(payload).not.toHaveProperty('telefono');
    expect(payload).not.toHaveProperty('apellido');
  });

  it('creates Free then lets Premium request keep the account Free', () => {
    const wizard = new InAppSignupWizard();
    wizard.ownerName = 'Santi';
    wizard.businessName = 'Studio Norte';
    wizard.continue();
    wizard.toggleRubro('peluqueria');
    wizard.continue();
    wizard.email = 'santi@example.com';
    wizard.password = '12345678';
    wizard.confirmPassword = '12345678';

    wizard.markAccountCreated();
    expect(wizard.createdFree).toBe(true);
    expect(wizard.step).toBe(4);

    wizard.requestPremium();
    expect(wizard.premiumRequested).toBe(true);
    expect(wizard.step).toBe(5);
    expect(wizard.premiumRequestMetadata()).toEqual(
      expect.objectContaining({
        plan: 'FREE',
        premium_requested: true
      })
    );

    const freeWizard = new InAppSignupWizard();
    freeWizard.markAccountCreated();
    freeWizard.chooseFree();
    expect(freeWizard.premiumRequested).toBe(false);
    expect(freeWizard.step).toBe(5);
    expect(freeWizard.premiumRequestMetadata()).toEqual(
      expect.objectContaining({
        plan: 'FREE',
        premium_requested: false
      })
    );
  });

  it('backs from steps 2-4 and hides step chrome on success', () => {
    const wizard = new InAppSignupWizard();
    wizard.ownerName = 'Santi';
    wizard.businessName = 'Studio Norte';
    wizard.continue();
    wizard.toggleRubro('peluqueria');
    wizard.continue();
    expect(wizard.canGoBack()).toBe(true);
    wizard.back();
    expect(wizard.step).toBe(2);
    wizard.continue();
    wizard.email = 'santi@example.com';
    wizard.password = '12345678';
    wizard.confirmPassword = '12345678';
    wizard.markAccountCreated();
    expect(wizard.canGoBack()).toBe(true);
    wizard.chooseFree();
    expect(wizard.canGoBack()).toBe(false);
    expect(wizard.showsStepChrome()).toBe(false);
  });

  it('loads rubros from the dashboard reference catalog instead of a second hardcoded list', () => {
    const wizard = new InAppSignupWizard();
    const codes = wizard.rubroCatalog().map(item => item.code);

    expect(codes).toEqual(DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE.businessTypes.map(item => item.code));
    expect(codes).toContain('peluqueria');
    expect(codes).toContain('otro');
  });

  it('renders Rioplatense desktop wizard copy without phone chrome, apellido, or phone fields', async () => {
    const page = await readFile(WIZARD_PAGE, 'utf8');

    expect(page).toContain('¿Cómo te llamás?');
    expect(page).toContain('¿Qué rubro tenés?');
    expect(page).toContain('Creá tu acceso');
    expect(page).toContain('¿Qué plan querés?');
    expect(page).toContain('Ya estás adentro');
    expect(page).toContain('Crear cuenta');
    expect(page).toContain('Empezar gratis');
    expect(page).toContain('Pedir Premium y entrar');
    expect(page).toContain('Entrar a la agenda');
    expect(page).toContain('Premium pedido · Free activo');
    expect(page).not.toMatch(/apellido|teléfono|telefono|notch|home indicator|phone-frame/i);
    expect(page).toMatch(/prefers-reduced-motion/);
  });

  it('login surface lives in-app with a path to alta', async () => {
    const page = await readFile(LOGIN_PAGE, 'utf8');

    expect(page).toMatch(/AuthService/);
    expect(page).toMatch(/\.login\(/);
    expect(page).toContain('name="email"');
    expect(page).toContain('name="password"');
    expect(page).toContain('/auth/signup');
    expect(page).not.toContain('buildLandingSignupRedirect');
  });
});
