import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE } from '../../core/catalog/reference-catalog';
import { initializeRuntimeReferenceCatalogSnapshot } from '../../core/catalog/reference-catalog.gateway';
import { InAppSignupWizard } from '../../features/auth/in-app-signup-wizard';

const WIZARD_PAGE = new URL('../../features/auth/pages/in-app-signup-wizard.page.ts', import.meta.url);
const LOGIN_PAGE = new URL('../../features/auth/pages/in-app-login.page.ts', import.meta.url);

describe('Contract: in-app signup wizard (#562)', () => {
  initializeRuntimeReferenceCatalogSnapshot(DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE);

  it('disables identity continue until name, last name, and business name are all non-empty', () => {
    const wizard = new InAppSignupWizard();

    expect(wizard.step).toBe(1);
    expect(wizard.canContinue()).toBe(false);

    wizard.ownerName = 'Santi';
    expect(wizard.canContinue()).toBe(false);

    wizard.ownerLastName = 'Delebeq';
    expect(wizard.canContinue()).toBe(false);

    wizard.businessName = 'Studio Norte';
    expect(wizard.canContinue()).toBe(true);

    wizard.continue();
    expect(wizard.step).toBe(2);
  });

  it('requires exactly one rubro and replaces instead of accumulating', () => {
    const wizard = new InAppSignupWizard();
    wizard.ownerName = 'Santi';
    wizard.ownerLastName = 'Delebeq';
    wizard.businessName = 'Studio Norte';
    wizard.continue();

    expect(wizard.canContinue()).toBe(false);
    expect(wizard.buildCreateAccountPayload().selected_business_types).toEqual([]);

    wizard.toggleRubro('unas');
    wizard.toggleRubro('peluqueria');

    expect(wizard.canContinue()).toBe(true);
    expect(wizard.selectedRubros).toEqual(['peluqueria']);
    expect(wizard.principalRubro()).toBe('peluqueria');
    expect(wizard.buildCreateAccountPayload().selected_business_types).toEqual(['peluqueria']);
    expect(wizard.buildCreateAccountPayload().selected_business_types).toHaveLength(1);

    wizard.toggleRubro('peluqueria');
    expect(wizard.selectedRubros).toEqual([]);
    expect(wizard.canContinue()).toBe(false);
    expect(wizard.buildCreateAccountPayload().selected_business_types).toEqual([]);
  });

  it('rejects password shorter than 8 characters or a mismatch before creating the Free account', () => {
    const wizard = new InAppSignupWizard();
    wizard.ownerName = 'Santi';
    wizard.ownerLastName = 'Delebeq';
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
    expect(wizard.accessError()).toBe('');

    wizard.password = '1234567';
    wizard.confirmPassword = '1234567';
    expect(wizard.accessError()).toBe('Mínimo 8 caracteres.');

    wizard.password = '12345678';
    wizard.confirmPassword = '12345679';
    expect(wizard.accessError()).toBe('Las contraseñas no coinciden.');

    wizard.confirmPassword = '12345678';
    expect(wizard.canContinue()).toBe(true);

    const payload = wizard.buildCreateAccountPayload();
    expect(payload.plan).toBe('FREE');
    expect(payload.nombre).toBe('Santi');
    expect(payload.apellido).toBe('Delebeq');
    expect(payload.negocioNombre).toBe('Studio Norte');
    expect(payload.rubro).toBe('peluqueria');
    expect(payload.selected_business_types).toEqual(['peluqueria']);
    expect(payload.selected_business_types).toHaveLength(1);
    expect(payload).not.toHaveProperty('telefono');
  });

  it('creates Free then lets Premium request keep the account Free', () => {
    const wizard = new InAppSignupWizard();
    wizard.ownerName = 'Santi';
    wizard.ownerLastName = 'Delebeq';
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
    wizard.ownerLastName = 'Delebeq';
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

  it('renders Rioplatense desktop wizard copy with apellido and without phone chrome', async () => {
    const page = await readFile(WIZARD_PAGE, 'utf8');

    expect(page).toContain('¿Cómo te llamás?');
    expect(page).toContain('¿Qué rubro tenés?');
    expect(page).toContain('Elegí un rubro.');
    expect(page).not.toContain('Elegí uno o más');
    expect(page).not.toContain('Más rubros');
    expect(page).toContain('Creá tu acceso');
    expect(page).toContain('Paso 4 de 4');
    expect(page).toContain('¿Qué plan querés?');
    expect(page).toContain('Arrancás gratis igual. Vos decidís cuándo sumar más.');
    expect(page).toContain('Entrás ahora, sin pagar nada.');
    expect(page).toContain('Sin pago, sin tarjeta');
    expect(page).toContain('Lo pedís, lo activamos nosotros.');
    expect(page).toContain('Agenda sin límites');
    expect(page).toContain('No se cobra ni se activa solo');
    expect(page).toContain('Ya estás adentro');
    expect(page).toContain('Tu negocio ya tiene agenda. Si pediste Premium, te avisamos cuando lo activemos.');
    expect(page).toContain('Crear cuenta');
    expect(page).toContain('Apellido');
    expect(page).toContain('ownerLastName');
    expect(page).toContain('accessError()');
    expect(page).toContain('syncAccessField');
    expect(page).toContain('Empezar gratis');
    expect(page).toContain('Pedir Premium y entrar');
    expect(page).toContain('Entrar a la agenda');
    expect(page).not.toContain('Premium pedido · Free activo');
    expect(page).toMatch(/import\('canvas-confetti'\)/);
    expect(page).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(page).not.toMatch(/teléfono|telefono|notch|home indicator|phone-frame/i);
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

  it('auth pages pin to the visual viewport so tall steps can scroll on mobile', async () => {
    const wizard = await readFile(WIZARD_PAGE, 'utf8');
    const login = await readFile(LOGIN_PAGE, 'utf8');

    for (const page of [wizard, login]) {
      expect(page).toMatch(/:host[\s\S]{0,280}position:\s*fixed/);
      expect(page).toMatch(/:host[\s\S]{0,280}inset:\s*0/);
      expect(page).toMatch(/:host[\s\S]{0,280}overflow:\s*auto/);
      expect(page).toMatch(/-webkit-overflow-scrolling:\s*touch/);
      expect(page).not.toMatch(/:host \{ display: block; height: 100%; overflow: auto; \}/);
    }
  });

  it('does not render Principal-vs-secondary chip chrome', async () => {
    const page = await readFile(WIZARD_PAGE, 'utf8');

    expect(page).toContain('{{ rubro.label }}');
    expect(page).not.toContain('Principal');
    expect(page).not.toMatch(/in-app-auth__chip-badge/);
  });
});

