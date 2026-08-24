import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readDashboardFile(pathFromDashboardRoot: string): string {
  return readFileSync(resolve(process.cwd(), pathFromDashboardRoot), 'utf-8');
}

describe('Dashboard bugfix product decisions contract', () => {
  it('hides global support entrypoints while preserving contextual support copy in settings/errors', () => {
    const shell = readDashboardFile('src/app/shared/dashboard-shell/dashboard-shell.component.html');
    const sidebar = readDashboardFile('src/app/shared/dashboard-sidebar/dashboard-sidebar.component.html');
    const zenSidebar = readDashboardFile('src/app/shared/dashboard-sidebar/templates/zen-sidebar.component.ts');
    const topbar = readDashboardFile('src/app/shared/dashboard-topbar/dashboard-topbar.component.html');
    const settings = readDashboardFile('src/app/features/settings/pages/themes/configuracion-zen-theme.component.html');

    expect(`${shell}\n${sidebar}\n${zenSidebar}\n${topbar}`).not.toMatch(
      /data-testid=["'](?:global-)?support|Soporte|Ayuda|support-button|openSupport/i
    );
    expect(settings).toMatch(/supportEmail|Email de Soporte/i);
  });

  it('keeps public portal links on the canonical root domain except localhost and QA', () => {
    const settingsPage = readDashboardFile('src/app/features/settings/pages/configuracion.page.ts');
    const settingsTemplate = readDashboardFile('src/app/features/settings/pages/themes/configuracion-zen-theme.component.html');
    const dashboardHome = readDashboardFile('src/app/features/dashboard-home/pages/dashboard-home.page.html');
    const publicBookingUrlHelper = readDashboardFile('../../packages/booking/src/domain/public-booking-url.ts');

    expect(`${settingsPage}\n${publicBookingUrlHelper}`).toMatch(/buildPublicBookingUrl/);
    expect(publicBookingUrlHelper).toMatch(/https:\/\/orvel\.pro/);
    expect(publicBookingUrlHelper).toMatch(/localhost|127\.0\.0\.1|0\.0\.0\.0/);
    expect(publicBookingUrlHelper).toMatch(/qa\.orvel\.pro/);
    expect(`${settingsPage}\n${settingsTemplate}\n${dashboardHome}`).not.toMatch(/dashboard\.orvel\.pro\/booking|\/auth\/signup\/plan[\s\S]{0,160}(booking|reservas)/i);
    expect(settingsTemplate).not.toMatch(/localhost|href=["'][^"']*\/auth\/signup\/plan/i);
  });

  it('settings exposes signup/account/onboarding identity, public contact, business, type, and plan fields', () => {
    const settingsPage = readDashboardFile('src/app/features/settings/pages/configuracion.page.ts');
    const settingsTemplate = readDashboardFile('src/app/features/settings/pages/themes/configuracion-zen-theme.component.html');
    const combined = `${settingsPage}\n${settingsTemplate}`;

    for (const field of [
      'firstName',
      'lastName',
      'phone',
      'whatsapp',
      'instagram',
      'supportEmail',
      'businessName',
      'businessType',
      'plan'
    ]) {
      expect(combined, `Settings must expose ${field}`).toMatch(new RegExp(field));
    }

    expect(settingsTemplate).toMatch(/Nombre|Apellido|Tel[eé]fono|Contacto P[uú]blico|Instagram|Email de Soporte/i);
    expect(settingsTemplate).toMatch(/Nombre para el p[uú]blico|Tipo de negocio|Plan Actual|Cuenta y Suscripci[oó]n/i);
  });

  it('defines a temporary frontend category mapping by business type with fallback Otro and no schema dependency', () => {
    const servicioSource = readDashboardFile('src/app/features/servicios/data-access/servicio.service.ts');
    const legacyServicioSource = readDashboardFile('src/app/services/servicio.service.ts');
    const combined = `${servicioSource}\n${legacyServicioSource}`;

    expect(combined).toMatch(/map.*BusinessType.*Categor|businessType.*Categor|get.*Categor.*BusinessType/i);
    expect(combined).toMatch(/peluqueria[\s\S]*(Cortes|Peinados|Color)|uñas[\s\S]*(Uñas|Manicur)/i);
    expect(combined).toMatch(/pestañas[\s\S]*Pestañas|cejas[\s\S]*Cejas|masajes[\s\S]*Masajes/i);
    expect(combined).toMatch(/fallback|default|\?\?|\|\|/i);
    expect(combined).toMatch(/['"]Otro['"]/);
    expect(combined).not.toMatch(/from\(['"](?:business_type_categories|category_business_types)['"]\)|alter\s+table/i);
  });

  it('onboarding completion persists the selected business type into business_settings', () => {
    const onboardingSource = readDashboardFile('src/app/features/onboarding/pages/signup-business-types-step.page.ts');

    expect(onboardingSource).toMatch(/from\(['"]business_settings['"]\)[\s\S]*business_type:\s*defaults\.businessType/i);
  });

  it('settings hydrates idempotently when auth arrives late and does not gate saved settings on slug validity', () => {
    const settingsPage = readDashboardFile('src/app/features/settings/pages/configuracion.page.ts');

    expect(settingsPage).toMatch(/effect\(\(\)\s*=>[\s\S]*authService\.user\(\)\?\.id[\s\S]*hydrateBusinessSettings/i);
    expect(settingsPage).toMatch(/hydratedUserId/);
    expect(settingsPage).not.toMatch(/setTimeout\(resolve,\s*500\)|setTimeout\([^)]*500/);
    expect(settingsPage).toMatch(/if\s*\(\s*saved\s*\)\s*\{[\s\S]*settingsForm\.patchValue\(saved\)[\s\S]*savedState\.set\(saved\)/i);
    expect(settingsPage).not.toMatch(/saved\s*&&\s*saved\.slug\s*&&\s*saved\.slug\s*!==\s*['"]id-pendiente['"]/i);
  });

  it('portal share actions communicate disabled state when no booking URL or clipboard support exists', () => {
    const settingsPage = readDashboardFile('src/app/features/settings/pages/configuracion.page.ts');
    const settingsTemplate = readDashboardFile('src/app/features/settings/pages/themes/configuracion-zen-theme.component.html');
    const dashboardHomeTs = readDashboardFile('src/app/features/dashboard-home/pages/dashboard-home.page.ts');
    const dashboardHomeHtml = readDashboardFile('src/app/features/dashboard-home/pages/dashboard-home.page.html');

    expect(`${settingsPage}\n${dashboardHomeTs}`).toMatch(/navigator\.clipboard\?\.writeText/);
    expect(`${settingsPage}\n${dashboardHomeTs}`).toMatch(/copyFailed|clipboardUnavailable|copyError/i);
    expect(`${settingsTemplate}\n${dashboardHomeHtml}`).toMatch(/aria-disabled/);
    expect(`${settingsTemplate}\n${dashboardHomeHtml}`).toMatch(/cursor-not-allowed|opacity-50|pointer-events-none/);
    expect(settingsTemplate).toMatch(/\(click\)="openPublicBookingPortal\(\$event\)"/);
    expect(settingsTemplate).not.toMatch(/<a [^>]*\[href\]="hasPublicBookingUrl\(\) \? publicBookingUrl\(\) : null"[\s\S]*target="_blank"/);
  });

  it('normalizes business type aliases/diacritics for temporary frontend category lookup', () => {
    const servicioSource = readDashboardFile('src/app/features/servicios/data-access/servicio.service.ts');

    expect(servicioSource).toMatch(/TEMPORARY_FRONTEND_BUSINESS_TYPE_CATEGORY_MAP|temporary frontend/i);
    expect(servicioSource).toMatch(/normalizeBusinessTypeCategoryKey/);
    expect(servicioSource).toMatch(/normalize\(['"]NFD['"]\)[\s\S]*replace\(\/\[\\u0300-\\u036f\]/);
    expect(servicioSource).toMatch(/hair_salon|nail_salon|barber_shop|spa|pestanas/);
  });

  it('does not persist or hydrate internal plan from public business_settings', () => {
    const businessService = readDashboardFile('src/app/features/settings/data-access/business.service.ts');
    const businessSettingsFacade = readDashboardFile('src/app/features/settings/data-access/business-settings.facade.ts');
    const onboardingBusinessTypesStep = readDashboardFile('src/app/features/onboarding/pages/signup-business-types-step.page.ts');

    expect(businessService).not.toMatch(/plan:\s*settings\.plan/);
    expect(businessService).not.toMatch(/plan:\s*settings\?\.plan/);
    expect(businessService).toMatch(/plan:\s*this\.resolveDisplayPlan/);

    const onboardingSettingsUpsertStart = onboardingBusinessTypesStep.indexOf(".from('business_settings')");
    const onboardingSettingsUpsertEnd = onboardingBusinessTypesStep.indexOf("{ onConflict: 'business_id' }", onboardingSettingsUpsertStart);
    const onboardingSettingsUpsert = onboardingBusinessTypesStep.slice(onboardingSettingsUpsertStart, onboardingSettingsUpsertEnd);
    expect(onboardingSettingsUpsert).not.toMatch(/\bplan\s*:/i);

    expect(businessSettingsFacade).not.toMatch(/plan\?:\s*['"]basic['"]/);
    expect(businessSettingsFacade).not.toMatch(/plan:\s*persistedLocal\.plan/);
    expect(businessSettingsFacade).not.toMatch(/plan:\s*row\.plan/);
    expect(businessSettingsFacade).toMatch(/plan:\s*this\.resolveDisplayPlan\(\)/);
  });

  it('public booking resolver uses the RPC boundary instead of raw public settings queries', () => {
    const businessService = readDashboardFile('src/app/features/settings/data-access/business.service.ts');

    expect(businessService).toMatch(/rpc\(['"]resolve_business_by_slug['"]/);
    expect(businessService).not.toMatch(/resolveBusinessBySlug[\s\S]*\.from\(['"]business_settings['"]\)[\s\S]*\.select\(['"]\*['"]\)/);
    expect(businessService).not.toMatch(/resolveBusinessBySlug[\s\S]*\.from\(['"]business_settings['"]\)[\s\S]*\bplan\b/i);
  });
});
