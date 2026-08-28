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

  it('shows a Perfil title and Cuenta / Soporte sections', () => {
    expect(source).toMatch(/<h1[^>]*>\s*Perfil\s*<\/h1>/);
    expect(source).toContain('Cuenta');
    expect(source).toContain('Soporte');
  });

  it('links Mi negocio to the configuracion negocio tab', () => {
    expect(source).toContain('Mi negocio');
    expect(source).toMatch(/routerLink=["']\/dashboard\/configuracion["']/);
    expect(source).toMatch(/\[queryParams\]="\{\s*tab:\s*['"]negocio['"]\s*\}"/);
  });

  it('links Notificaciones with an Activas value', () => {
    expect(source).toContain('Notificaciones');
    expect(source).toMatch(/routerLink=["']\/dashboard\/notificaciones["']/);
    expect(source).toContain('Activas');
  });

  it('opens help via mailto and privacy via the landing terms URL', () => {
    expect(source).toContain('Ayuda y soporte');
    expect(source).toContain('mailto:orvel2026@gmail.com');
    expect(source).toContain('Privacidad y datos');
    expect(source).toContain('https://orvel.app/terminos-y-condiciones');
  });

  it('keeps Cerrar sesión as a danger logout action', () => {
    expect(source).toContain('Cerrar sesión');
    expect(source).toMatch(/data-testid=["']perfil-logout["']/);
    expect(source).toMatch(/#F87171/);
  });

  it('uses Inicio mobile tokens and a real plan badge without mock copy', () => {
    expect(source.includes('#0A0E1B') || source.includes('#7C5CFF')).toBe(true);
    expect(source).toMatch(/from\s+['"][^'"]*settings\/data-access\/business\.service['"]/);
    expect(source).toMatch(/settings\(\s*\)\?\.plan/);
    expect(source).toMatch(/Plan /);
    expect(source).not.toContain('Santiago');
    expect(source).not.toContain('Plan Pro');
    expect(source).not.toContain('2.4.1');
  });
});
