import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Subject } from 'rxjs';

const source = (path: string): string => {
  const absolutePath = resolve(process.cwd(), path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
};

describe('Contract: PWA in-app update banner (#402)', () => {
  const servicePath = 'src/app/features/pwa-in-app-update/pwa-in-app-update.service.ts';
  const controllerPath = 'src/app/features/pwa-in-app-update/pwa-in-app-update.controller.ts';
  const bannerPath = 'src/app/features/pwa-in-app-update/pwa-in-app-update-banner.component.ts';
  const updateSource = () => source(servicePath) + source(controllerPath);

  it('registers an ngsw update check and stays silent until VERSION_READY', async () => {
    const service = updateSource();
    const { createPwaInAppUpdateController } = await import(
      '../../features/pwa-in-app-update/pwa-in-app-update.controller'
    );

    expect(service).toContain('SwUpdate');
    expect(service).toContain('versionUpdates');
    expect(service).toContain('VERSION_READY');
    expect(service).toContain('checkForUpdate');
    expect(service).not.toMatch(/provideServiceWorker\(/);

    const versionUpdates = new Subject<{ type: string }>();
    const checkForUpdate = vi.fn(async () => false);
    const activateUpdate = vi.fn(async () => true);
    const reload = vi.fn();
    const controller = createPwaInAppUpdateController(
      { isEnabled: true, versionUpdates: versionUpdates.asObservable(), checkForUpdate, activateUpdate },
      reload,
    );

    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    expect(controller.updateReady()).toBe(false);

    versionUpdates.next({ type: 'VERSION_DETECTED' });
    versionUpdates.next({ type: 'NO_NEW_VERSION_DETECTED' });
    expect(controller.updateReady()).toBe(false);

    versionUpdates.next({ type: 'VERSION_READY' });
    expect(controller.updateReady()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it('exposes one-tap activateUpdate then reload', async () => {
    const service = updateSource();
    const { createPwaInAppUpdateController } = await import(
      '../../features/pwa-in-app-update/pwa-in-app-update.controller'
    );

    expect(service).toMatch(/activateUpdate\s*\(/);
    expect(service).toMatch(/location\.reload|reload\s*\(/);

    const versionUpdates = new Subject<{ type: string }>();
    const checkForUpdate = vi.fn(async () => true);
    const activateUpdate = vi.fn(async () => true);
    const reload = vi.fn();
    const controller = createPwaInAppUpdateController(
      { isEnabled: true, versionUpdates: versionUpdates.asObservable(), checkForUpdate, activateUpdate },
      reload,
    );

    await controller.applyUpdate();
    expect(activateUpdate).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(activateUpdate.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]);
  });

  it('does not check or prompt when the service worker is disabled', async () => {
    const { createPwaInAppUpdateController } = await import(
      '../../features/pwa-in-app-update/pwa-in-app-update.controller'
    );
    const checkForUpdate = vi.fn(async () => true);
    const activateUpdate = vi.fn(async () => true);
    const controller = createPwaInAppUpdateController(
      {
        isEnabled: false,
        versionUpdates: new Subject<{ type: string }>().asObservable(),
        checkForUpdate,
        activateUpdate,
      },
      vi.fn(),
    );

    expect(checkForUpdate).not.toHaveBeenCalled();
    expect(controller.updateReady()).toBe(false);
  });

  it('shows a non-blocking Spanish banner with a named apply control', () => {
    const banner = source(bannerPath);
    const template = banner.match(/template:\s*`([\s\S]*?)`/)?.[1] ?? banner;

    expect(template).toMatch(/@if\s*\(\s*updateReady\(\)\s*\)/);
    expect(template).toContain('data-testid="pwa-in-app-update-banner"');
    expect(template).toMatch(/role=["']status["']/);
    expect(template).not.toMatch(/role=["']dialog["']/);
    expect(template).not.toContain('aria-modal');
    expect(template).toContain('Hay una actualización. Tocá para usarla.');
    expect(template).toMatch(/<button[^>]*type=["']button["'][^>]*>[\s\S]*Usar ahora/);
    expect(template).toContain('data-testid="pwa-in-app-update-apply"');
    expect(banner).toMatch(/applyUpdate\s*\(/);
  });

  it('wires the banner at app root on every route without changing SW registration', () => {
    const appHtml = source('src/app/app.html');
    const appTs = source('src/app/app.ts');
    const appConfig = source('src/app/app.config.ts');
    const manifest = source('src/manifest.webmanifest');

    expect(appHtml).toContain('app-pwa-in-app-update-banner');
    expect(appTs).toContain('PwaInAppUpdateBannerComponent');
    expect(appConfig).toContain("provideServiceWorker('/dashboard/orvel-push-sw.js'");
    expect(appConfig).toContain("scope: '/dashboard/'");
    expect(appConfig).toContain('registerImmediately');
    expect(manifest).toMatch(/"start_url":\s*"\/dashboard\/turnos"/);
    expect(manifest).toMatch(/"scope":\s*"\/dashboard\/"/);
  });
});
