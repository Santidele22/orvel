import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const routeBlock = (routesSource: string, path: string) => {
  const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return routesSource.match(new RegExp(`\\{\\s*path:\\s*'${escapedPath}',[\\s\\S]*?\\n\\s*\\}`))?.[0] ?? '';
};

describe('Contract: public PWA install-only page', () => {
  it('exposes dashboard/installar as a public top-level route before the guarded dashboard parent', () => {
    const appRoutes = source('src/app/app.routes.ts');
    const installar = routeBlock(appRoutes, 'dashboard/installar');
    const dashboard = routeBlock(appRoutes, 'dashboard');
    const installarIndex = appRoutes.search(/path:\s*'dashboard\/installar'/);
    const dashboardIndex = appRoutes.search(/path:\s*'dashboard'\s*,/);

    expect(installar).toContain('loadComponent');
    expect(installar).not.toContain('canActivate');
    expect(installarIndex).toBeGreaterThan(-1);
    expect(installarIndex).toBeLessThan(dashboardIndex);
    expect(dashboard).toContain('canActivate: [dashboardAuthGuard]');
  });

  it('keeps the install page free of login and dashboard navigation, and defers beforeinstallprompt', () => {
    const appRoutes = source('src/app/app.routes.ts');
    const installar = routeBlock(appRoutes, 'dashboard/installar');
    const importPath = installar.match(/import\('(\.\/[^']+)'\)/)?.[1];

    expect(importPath).toBeTruthy();

    const pagePath = `src/app/${importPath!.replace(/^\.\//, '')}.ts`;
    const page = source(pagePath);

    expect(page).not.toContain('buildLandingLoginRedirect');
    expect(page).not.toContain('dashboardAuthGuard');
    expect(page).not.toMatch(/\/auth\/login/);
    expect(page).not.toMatch(/\/dashboard\/turnos/);
    expect(page).not.toMatch(/\/dashboard\/inicio/);
    expect(page).toContain('beforeinstallprompt');
    expect(page).toContain('prompt(');
    expect(page).toContain('__ORVEL_DEFERRED_INSTALL_PROMPT');
  });

  it('captures beforeinstallprompt in index.html before app-root', () => {
    const html = source('src/index.html');
    const appRootIndex = html.indexOf('<app-root>');
    const beforeAppRoot = html.slice(0, appRootIndex);

    expect(appRootIndex).toBeGreaterThan(-1);
    expect(beforeAppRoot).toContain('beforeinstallprompt');
    expect(beforeAppRoot).toContain('preventDefault');
    expect(beforeAppRoot).toContain('__ORVEL_DEFERRED_INSTALL_PROMPT');
  });

  it('shows numbered iOS steps and an honest Android next step without requiring a click', () => {
    const page = source('src/app/features/pwa-install/pages/pwa-install.page.ts');
    const template = page.match(/template:\s*`([\s\S]*?)`,/)?.[1] ?? '';
    const withoutGatedHint = template.replace(
      /@if\s*\(\s*showManualInstructions\(\)\s*\)\s*\{[\s\S]*?\}/g,
      '',
    );

    expect(withoutGatedHint).toMatch(/ri-share-line/);
    expect(withoutGatedHint).toMatch(/Compartir/);
    expect(withoutGatedHint).toMatch(/pantalla de inicio/i);
    expect(withoutGatedHint).toMatch(/<ol[\s\S]*<li[\s\S]*<li/i);
    expect(withoutGatedHint).toMatch(/Android/i);
    expect(withoutGatedHint).toMatch(/Chrome del celular/i);
    expect(page).not.toContain('Este navegador no ofrece el diálogo de instalación.');
  });

  it('keeps the PWA manifest start_url and scope unchanged', () => {
    const manifest = source('src/manifest.webmanifest');

    expect(manifest).toMatch(/"start_url":\s*"\/dashboard\/turnos"/);
    expect(manifest).toMatch(/"scope":\s*"\/dashboard\/"/);
  });

  it('registers the Angular service worker at the combined-deploy dashboard path immediately', () => {
    const config = source('src/app/app.config.ts');

    expect(config).toContain("provideServiceWorker('/dashboard/ngsw-worker.js'");
    expect(config).toContain('registerImmediately');
    expect(config).not.toContain("provideServiceWorker('ngsw-worker.js'");
  });

  it('detects iOS via the shared helper and never calls prompt() on that path', () => {
    const helper = source('src/app/features/pwa-install/pwa-display.ts');
    const page = source('src/app/features/pwa-install/pages/pwa-install.page.ts');
    const promptAfterIos = page.match(/isIos[\s\S]{0,240}?prompt\(/)?.[0] ?? '';

    expect(helper).toContain('export function isIosDevice');
    expect(helper).toMatch(/iPhone\|iPad\|iPod/);
    expect(page).toContain('isIosDevice');
    expect(page).toMatch(/if\s*\(\s*(?:this\.)?isIos/);
    expect(promptAfterIos).toBe('');
    expect(page).not.toContain('no ofrece el diálogo');
  });

  it('classifies standalone display and iOS devices from the shared helper', async () => {
    const { isStandaloneDisplay, isIosDevice } = await import(
      '../../features/pwa-install/pwa-display'
    );

    expect(isStandaloneDisplay(true, false)).toBe(true);
    expect(isStandaloneDisplay(false, true)).toBe(true);
    expect(isStandaloneDisplay(false, false)).toBe(false);
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)')).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(false);
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', true)).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', false)).toBe(false);
  });

  it('shows an already-installed state without an Instalar CTA', () => {
    const page = source('src/app/features/pwa-install/pages/pwa-install.page.ts');
    const template = page.match(/template:\s*`([\s\S]*?)`,/)?.[1] ?? '';

    expect(page).toContain('isStandaloneDisplay');
    expect(template).toMatch(/ya está instalada/i);
    expect(template).toMatch(/@if\s*\(\s*alreadyInstalled\(\)\s*\)/);
    expect(template).toMatch(
      /@if\s*\(\s*(?:canPromptNativeInstall|showInstallCta)\(\)\s*\)\s*\{[\s\S]*Instalar/,
    );
  });

  it('places a home install coach on mobile and desktop, hidden when standalone', () => {
    const helper = source('src/app/features/pwa-install/pwa-display.ts');
    const homeTs = source('src/app/features/dashboard-home/pages/dashboard-home.page.ts');
    const homeHtml = source('src/app/features/dashboard-home/pages/dashboard-home.page.html');
    const coachHits = homeHtml.split('data-testid="pwa-install-coach"').length - 1;

    expect(helper).toContain('export function isStandaloneDisplay');
    expect(homeTs).toContain('isStandaloneDisplay');
    expect(homeHtml).toContain('routerLink="/dashboard/installar"');
    expect(coachHits).toBeGreaterThanOrEqual(2);
    expect(homeHtml).toMatch(/@if\s*\(\s*!isPwaStandalone\(\)\s*\)/);
  });
});
