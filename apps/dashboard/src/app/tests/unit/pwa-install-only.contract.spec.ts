import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
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
    expect(dashboard).toContain('loadChildren');
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

  it('keeps an honest Android next step without requiring a click', () => {
    const page = source('src/app/features/pwa-install/pages/pwa-install.page.ts');
    const template = page.match(/template:\s*`([\s\S]*?)`,/)?.[1] ?? '';
    const howToCopy = template.match(/@else\s*\{([\s\S]*?)\}\s*@if\s*\(\s*installFeedback/)?.[1] ?? '';

    expect(howToCopy).toMatch(/Android/i);
    expect(howToCopy).toMatch(/Chrome del celular/i);
    expect(howToCopy).toContain('Tocá Instalar');
    expect(page).not.toContain('Este navegador no ofrece el diálogo de instalación.');
  });

  it('shows iOS uninstalled entry copy and Cómo instalar without listing steps until the coach modal opens', () => {
    const page = source('src/app/features/pwa-install/pages/pwa-install.page.ts');
    const template = page.match(/template:\s*`([\s\S]*?)`,/)?.[1] ?? '';
    const howToCopy = template.match(/@else\s*\{([\s\S]*?)\}\s*@if\s*\(\s*installFeedback/)?.[1] ?? '';
    const iosBranch = howToCopy.match(/@if\s*\(\s*isIos\(\)\s*\)\s*\{([\s\S]*?)\}\s*@else/)?.[1] ?? '';
    const coachModal = template.match(
      /@if\s*\(\s*isIosInstallCoachOpen\(\)\s*\)\s*\{([\s\S]*?)\}\s*(?:@if\s*\(\s*isInstallSuccessModalOpen|$)/,
    )?.[1] ?? '';

    expect(howToCopy).toContain('Instalá la app');
    expect(iosBranch).toContain('En 3 toques la tenés en tu pantalla de inicio.');
    expect(iosBranch).toContain('Cómo instalar');
    expect(iosBranch).not.toMatch(/pwa-install__steps|<ol/i);
    expect(iosBranch).not.toMatch(/>\s*Instalar\s*</);
    expect(template).toMatch(/@if\s*\(\s*isIosInstallCoachOpen\(\)\s*\)/);
    expect(coachModal).toMatch(/<ol[\s\S]*<li[\s\S]*<li[\s\S]*<li/i);
  });

  it('never offers a native Instalar CTA or prompt() on the iOS coaching path', () => {
    const page = source('src/app/features/pwa-install/pages/pwa-install.page.ts');
    const openCoach = page.match(/openIosInstallCoach\s*\(\s*\)\s*:\s*void\s*\{[\s\S]*?\n  \}/)?.[0] ?? '';
    const promptAfterIos = page.match(/isIos[\s\S]{0,240}?prompt\(/)?.[0] ?? '';

    expect(openCoach).toMatch(/isIosInstallCoachOpen\.set\(true\)/);
    expect(openCoach).not.toMatch(/prompt\(|navigator\.share|installApp\(/);
    expect(promptAfterIos).toBe('');
    expect(page).toMatch(/canPromptNativeInstall\(\)[\s\S]{0,80}!this\.isIos\(\)/);
  });

  it('renders the iOS instructions coach as a dialog with three honest Safari steps', () => {
    const page = source('src/app/features/pwa-install/pages/pwa-install.page.ts');
    const template = page.match(/template:\s*`([\s\S]*?)`,/)?.[1] ?? '';
    const coachModal = template.match(
      /data-testid=["']pwa-ios-install-coach-modal["'][\s\S]*?(?=@if\s*\(\s*isInstallSuccessModalOpen|$)/,
    )?.[0] ?? '';

    expect(template).toMatch(/data-testid=["']pwa-ios-install-coach-modal["']/);
    expect(coachModal).toMatch(/role=["']dialog["']/);
    expect(coachModal).toMatch(/aria-modal=["']true["']/);
    expect(coachModal).toContain('Tres toques y entras');
    expect(coachModal).toContain('Tocá Compartir, abajo');
    expect(coachModal).toContain('Agregar a Inicio');
    expect(coachModal).toMatch(/deslizá/);
    expect(coachModal).toContain('Confirmá "Agregar"');
    expect(coachModal).toContain('Ya la agregué');
    expect(coachModal).toMatch(/ri-share-line/);
    expect(coachModal).toMatch(/ri-add-line/);
    expect(coachModal).toMatch(/ri-close-line/);
    expect(coachModal).toContain('src="/dashboard/icons/icon-192x192.png"');
    expect(coachModal).toMatch(/\(click\)="closeIosInstallCoach\(\)"/);
    expect(template).toMatch(/data-testid=["']pwa-ios-install-coach-overlay["']/);
    expect(template).toMatch(/data-testid=["']pwa-ios-install-coach-close["']/);
  });

  it('marks iOS self-confirm as already installed for this session without the Android success modal', () => {
    const page = source('src/app/features/pwa-install/pages/pwa-install.page.ts');
    const confirm = page.match(/confirmIosAdded\s*\(\s*\)\s*:\s*void\s*\{[\s\S]*?\n  \}/)?.[0] ?? '';

    expect(confirm).toMatch(/alreadyInstalled\.set\(true\)/);
    expect(confirm).toMatch(/isIosInstallCoachOpen\.set\(false\)/);
    expect(confirm).not.toMatch(/isInstallSuccessModalOpen\.set\(true\)/);
    expect(confirm).not.toMatch(/localStorage/);
    expect(page).not.toMatch(/alreadyInstalled[\s\S]{0,200}localStorage/);
  });

  it('dismisses the iOS coach without marking the app installed', () => {
    const page = source('src/app/features/pwa-install/pages/pwa-install.page.ts');
    const closeCoach = page.match(/closeIosInstallCoach\s*\(\s*\)\s*:\s*void\s*\{[\s\S]*?\n  \}/)?.[0] ?? '';

    expect(closeCoach).toMatch(/isIosInstallCoachOpen\.set\(false\)/);
    expect(closeCoach).not.toMatch(/alreadyInstalled\.set\(true\)/);
  });

  it('does not render a fake Safari share sheet', () => {
    const page = source('src/app/features/pwa-install/pages/pwa-install.page.ts');
    const template = page.match(/template:\s*`([\s\S]*?)`,/)?.[1] ?? '';

    expect(page).not.toContain('navigator.share');
    expect(template).not.toMatch(/Agregar a Favoritos/);
    expect(template).not.toMatch(/Copiar/);
    expect(template).not.toMatch(/share-sheet|safari-share/i);
  });

  it('keeps the PWA manifest start_url and scope unchanged', () => {
    const manifest = source('src/manifest.webmanifest');

    expect(manifest).toMatch(/"start_url":\s*"\/dashboard\/turnos"/);
    expect(manifest).toMatch(/"scope":\s*"\/dashboard\/"/);
  });

  it('registers the Angular service worker at the combined-deploy dashboard path immediately', () => {
    const config = source('src/app/app.config.ts');
    const pushSw = source('src/orvel-push-sw.js');

    expect(config).toMatch(/provideServiceWorker\('\/dashboard\/[^']+'/);
    expect(config).toContain('registerImmediately');
    expect(config).toContain("scope: '/dashboard/'");
    expect(config).not.toContain("provideServiceWorker('ngsw-worker.js'");
    expect(pushSw).toContain("importScripts('./ngsw-worker.js')");
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
    const { isStandaloneDisplay, isIosDevice, shouldShowBootSplash } = await import(
      '../../features/pwa-install/pwa-display'
    );

    expect(isStandaloneDisplay(true, false)).toBe(true);
    expect(isStandaloneDisplay(false, true)).toBe(true);
    expect(isStandaloneDisplay(false, false)).toBe(false);
    expect(shouldShowBootSplash(false, false, false, false)).toBe(false);
    expect(shouldShowBootSplash(true, false, false, false)).toBe(true);
    expect(shouldShowBootSplash(false, false, true, false)).toBe(true);
    expect(shouldShowBootSplash(false, false, false, true)).toBe(true);
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

  it('shows the Orvel logo and ships real PWA icons instead of placeholders', () => {
    const page = source('src/app/features/pwa-install/pages/pwa-install.page.ts');
    const template = page.match(/template:\s*`([\s\S]*?)`,/)?.[1] ?? '';
    const icon192 = resolve(process.cwd(), 'src/icons/icon-192x192.png');
    const icon512 = resolve(process.cwd(), 'src/icons/icon-512x512.png');

    expect(template).toContain('class="pwa-install__logo"');
    expect(template).toContain('src="/dashboard/icons/icon-192x192.png"');
    expect(template).toMatch(/alt=["']Orvel["']/);
    expect(statSync(icon192).size).toBeGreaterThan(10_000);
    expect(statSync(icon512).size).toBeGreaterThan(10_000);
    expect(readFileSync(icon192).subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(readFileSync(icon512).subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
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
