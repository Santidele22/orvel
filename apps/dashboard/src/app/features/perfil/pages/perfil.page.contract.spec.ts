import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./perfil.page.ts', import.meta.url), 'utf8');

describe('PerfilPage contract', () => {
  it('shows signed-in nombre and email from AuthService', () => {
    expect(source).toMatch(/from\s+['"][^'"]*services\/auth\.service['"]/);
    expect(source).toMatch(/user\(\s*\)\?\.nombre/);
    expect(source).toMatch(/user\(\s*\)\?\.email/);
  });

  it('links to configuracion with RouterLink', () => {
    expect(source).toMatch(/\bRouterLink\b/);
    expect(source).toMatch(/routerLink=["']\/dashboard\/configuracion["']/);
    expect(source).toContain('Configuración');
    expect(source).toMatch(/data-testid=["']perfil-settings-link["']/);
  });

  it('uses the same logout helpers as the shell', () => {
    expect(source).toMatch(/logoutAndRedirect/);
    expect(source).toMatch(/from\s+['"][^'"]*core\/auth\/route-protection['"]/);
    expect(source).toMatch(/navigateAfterLogout/);
    expect(source).toMatch(/from\s+['"][^'"]*shared\/dashboard-shell\/logout-navigation['"]/);
    expect(source).toMatch(/data-testid=["']perfil-logout["']/);
  });

  it('exposes perfil-page test id', () => {
    expect(source).toMatch(/data-testid=["']perfil-page["']/);
  });
});
