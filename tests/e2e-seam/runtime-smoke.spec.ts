import { expect, test } from '@playwright/test';

/**
 * Fase 3 of #1098 — the gate that would have caught the regression that shipped.
 *
 * Corte 1 made the core read its runtime env through an injected fallback. A development build
 * evaluates the entry module's body *after* that entry's own imports, so a module-scope read threw
 * `[dashboard-env] Missing required env vars` and both apps served a dead page — while every build
 * and unit gate stayed green, because neither boots a browser.
 *
 * So this smoke runs against the **dev servers**, not the built artifacts: the production bundle
 * orders modules topologically and never had the bug. It asserts three things per target:
 * the app boots, the router resolves a protected route through the auth guard, and the console
 * reports no errors.
 */
const TARGETS = [
  { name: 'pwa (dashboard)', url: 'http://127.0.0.1:4200/dashboard/' },
  { name: 'web (dashboard-web)', url: 'http://127.0.0.1:4300/' }
] as const;

for (const target of TARGETS) {
  test.describe(`runtime smoke: ${target.name}`, () => {
    test('boots, routes through the auth guard, and logs no error', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

      // The guard sends an unauthenticated visitor to a login surface: the app's own in-app login
      // page, or the landing login. Stub the landing so a redirect there also completes.
      await page.route('**/auth/login**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: '<!doctype html><html lang="es"><body><h1>Login stub</h1><input id="email" aria-label="Email" /></body></html>'
        });
      });

      await page.goto(target.url);

      // Anchor on the login form, not on which surface serves it: the point of the smoke is that
      // the app booted and the router resolved a lazily-loaded route.
      await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
      await expect(page.getByRole('textbox', { name: /contrase|password/i })).toBeVisible();
      await expect(page).toHaveURL(/\/login/);

      expect(
        consoleErrors,
        'The app must boot without console or page errors (the #1098 corte-1 regression surfaced here).'
      ).toEqual([]);

      // Dev serves the PWA with `provideServiceWorker(..., { enabled: !isDevMode() })`, and the web
      // target never registers one at all.
      const registrations = await page.evaluate(async () =>
        'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0
      );
      expect(registrations).toBe(0);
    });
  });
}
