import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function cwd(): string {
  const processLike = (globalThis as { process?: { cwd?: () => string } }).process;
  return typeof processLike?.cwd === 'function' ? processLike.cwd() : '.';
}

async function readSource(relativePath: string): Promise<string> {
  return readFile(resolve(cwd(), relativePath), 'utf-8');
}

describe('TDD gate: zen-only MVP cleanup', () => {
  it('enforces only zen template visibility in configuración selectors', async () => {
    const configuracionTs = await readSource('src/app/features/settings/pages/configuracion.page.ts');
    const configuracionHtml = await readSource('src/app/features/settings/pages/configuracion.page.html');

    expect(configuracionTs).toMatch(/ConfiguracionZenThemeComponent/);
    expect(configuracionTs).not.toMatch(/Configuracion(Industrial|Chic|Ink)ThemeComponent/);

    expect(configuracionHtml).toMatch(/app-configuracion-theme-zen/);
    expect(configuracionHtml).not.toMatch(/app-configuracion-theme-(?!zen)[a-z-]+/);
  });

  it('blocks non-zen references in key runtime mapping modules', async () => {
    const templateFactory = await readSource('src/app/core/templates/dashboard-template.factory.ts');
    const templatesMap = await readSource('src/app/core/templates/dashboard-templates.ts');
    const themeTokens = await readSource('src/app/core/theming/theme.tokens.ts');
    const loginBusinessTypes = await readSource('src/app/core/auth/mock-login-business-types.ts');

    expect(templateFactory).toMatch(/zen\s*:\s*ZenTemplate/);
    expect(templateFactory).not.toMatch(/(industrial|chic|ink)\s*:/);
    expect(templatesMap).not.toMatch(/class\s+(IndustrialTemplate|ChicTemplate|InkTemplate)\b/);

    expect(themeTokens).toMatch(/export\s+type\s+DashboardThemeName\s*=\s*'zen'\s*;/);
    expect(themeTokens).not.toMatch(/'industrial'|'chic'|'ink'/);

    expect(loginBusinessTypes).toMatch(/ALLOWED_SELECTED_BUSINESS_TYPES\s*=\s*\['zen'\]\s+as\s+const/);
    expect(loginBusinessTypes).not.toMatch(/'industrial'|'chic'|'ink'/);
  });

  it('blocks non-zen artifacts in shared topbar/sidebar wrappers', async () => {
    const topbarTs = await readSource('src/app/shared/dashboard-topbar/dashboard-topbar.component.ts');
    const topbarHtml = await readSource('src/app/shared/dashboard-topbar/dashboard-topbar.component.html');
    const sidebarTs = await readSource('src/app/shared/dashboard-sidebar/dashboard-sidebar.component.ts');
    const sidebarHtml = await readSource('src/app/shared/dashboard-sidebar/dashboard-sidebar.component.html');

    expect(topbarTs).not.toMatch(/(industrial|chic|ink)/i);
    expect(topbarHtml).not.toMatch(/(isIndustrial|isChic|isInk|industrial|chic|ink)/i);

    expect(sidebarTs).not.toMatch(/(IndustrialSidebarComponent|ChicSidebarComponent|InkSidebarComponent)/);
    expect(sidebarHtml).not.toMatch(/(INDUSTRIAL SIDEBAR|CHIC SIDEBAR|INK SIDEBAR|industrial|chic|ink)/i);
  });

  it('prevents onboarding/session seeding from producing non-zen selections', async () => {
    const onboardingBusinessStep = await readSource('src/app/features/onboarding/pages/onboarding-business-step.page.ts');
    expect(onboardingBusinessStep).not.toMatch(/'industrial'|'chic'|'ink'/);

    const { createMockSessionFromLogin } = await import('../../core/auth/mock-login-business-types');
    const { validateSessionSchema } = await import('../../core/auth/session-contract');

    const session = createMockSessionFromLogin({
      email: 'demo@turnea.app',
      selectedBusinessTypes: ['industrial', 'chic', 'ink', 'zen']
    });

    expect(session.selectedBusinessTypes).toEqual(['zen']);
    expect(validateSessionSchema({ ...session, selectedBusinessTypes: ['industrial'] }, session.issuedAt)).toBe(
      false
    );
  });

  it('enforces zen-only theme contracts at runtime boundaries', async () => {
    const themePalettesSource = await readSource('src/app/core/theming/dashboard-theme-palettes.tokens.ts');
    expect(themePalettesSource).not.toMatch(/^(\s*)(industrial|chic|ink):/m);

    const { DASHBOARD_THEME_PALETTES, DASHBOARD_THEME_ALIASES } = await import(
      '../../core/theming/dashboard-theme-palettes.tokens'
    );
    const { applyDashboardTheme } = await import('../../core/theming/theme-runtime');

    expect(Object.keys(DASHBOARD_THEME_PALETTES)).toEqual(['zen']);
    expect(new Set(Object.values(DASHBOARD_THEME_ALIASES))).toEqual(new Set(['zen']));

    const cssVars = new Map<string, string>();
    const host = {
      dataset: {} as Record<string, string>,
      style: {
        setProperty: (name: string, value: string) => {
          cssVars.set(name, value);
        }
      }
    } as unknown as HTMLElement;

    applyDashboardTheme(host, 'industrial' as never);

    expect(host.dataset['theme']).toBe('zen');
    expect(cssVars.get('--bg')).toBeDefined();
  });

  it('keeps the zen critical flow operative after cleanup', async () => {
    const { resolveDashboardConfigFromSession } = await import('../../core/theming/dashboard-session-business-types');
    const { sanitizeSelectedBusinessTypes } = await import('../../core/auth/mock-login-business-types');

    expect(resolveDashboardConfigFromSession({}).dashboards).toEqual([
      { businessType: 'zen', theme: 'zen' }
    ]);

    const selectedBusinessTypes = sanitizeSelectedBusinessTypes(['zen']);

    expect(resolveDashboardConfigFromSession({ selectedBusinessTypes }).dashboards).toEqual([
      { businessType: 'zen', theme: 'zen' }
    ]);
  });
});
