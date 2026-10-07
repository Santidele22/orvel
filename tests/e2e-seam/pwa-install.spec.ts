import { expect, test } from '@playwright/test';

/**
 * Fase 3 of #1098 — the installable product did not change (acceptance of the web/pwa split).
 *
 * This runs against a **production build** served by `scripts/serve-dashboard-dist.mjs`, because
 * the service worker only registers outside dev mode and `ngsw-worker.js` is only emitted by a
 * production build. A dev-server test here would assert nothing.
 *
 * A browser cannot accept an install prompt programmatically, so "install works" is checked as the
 * three things it actually consists of: a valid manifest, a precache configuration, and a service
 * worker that registers, activates at the right scope and takes control.
 */
test.describe('PWA install surface', () => {
  test('serves a manifest that makes the app installable', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/manifest.webmanifest`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/manifest+json');

    const manifest = await response.json();

    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name ?? manifest.name).toBeTruthy();
    expect(manifest.start_url).toMatch(/^\/dashboard\/|^\.?\/?dashboard/);
    expect(manifest.display).toBe('standalone');

    const sizes = (manifest.icons ?? []).map((icon: { sizes?: string }) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  test('holds the precache configuration the install depends on', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/ngsw.json`);

    expect(response.status()).toBe(200);

    const config = await response.json();
    const groupNames = (config.assetGroups ?? []).map((group: { name: string }) => group.name);

    expect(groupNames).toEqual(expect.arrayContaining(['app', 'app-lazy', 'assets']));

    // There is deliberately no dataGroup: the PWA precaches the shell, it is not an offline data
    // layer. If that changes, this assertion is where the decision gets recorded.
    expect(config.dataGroups ?? []).toEqual([]);
  });

  test('renders the install guidance without an auth redirect', async ({ page, baseURL }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

    await page.goto(`${baseURL}/installar`);

    await expect(page).toHaveURL(/\/dashboard\/installar$/);
    // The first child of app-root is the update banner, which is legitimately hidden when there is
    // no update; anchor on the page's own content instead.
    await expect(page.getByRole('heading', { name: /instal[aá] la app/i })).toBeVisible();
    await expect(page.getByText(/toc[aá] instalar/i).first()).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('registers and activates the push worker at the dashboard scope', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/installar`);

    const registration = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false } as const;

      const ready = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000))
      ]);

      if (!ready) return { supported: true, ready: false } as const;

      return {
        supported: true,
        ready: true,
        scope: ready.scope,
        activeScript: ready.active?.scriptURL ?? null,
        controlled: Boolean(navigator.serviceWorker.controller)
      } as const;
    });

    expect(registration.supported).toBe(true);
    expect(registration, 'the service worker never became ready').toMatchObject({ ready: true });
    if (!registration.ready) return;

    expect(registration.scope).toMatch(/\/dashboard\/$/);
    expect(registration.activeScript).toMatch(/\/dashboard\/orvel-push-sw\.js$/);
    expect(registration.controlled, 'the service worker must control the page it precached').toBe(true);
  });

  test('serves ngsw-worker.js where the push worker imports it from', async ({ request, baseURL }) => {
    // orvel-push-sw.js does `importScripts('./ngsw-worker.js')`, and it is served from
    // /dashboard/, so the Angular worker has to be reachable at that same depth.
    const response = await request.get(`${baseURL}/ngsw-worker.js`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('javascript');
  });
});
