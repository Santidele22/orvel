import { expect, test } from '@playwright/test';

/**
 * The dashboard's public surfaces, against the dev server.
 *
 * These tests used to assert against a live backend and against copy that no longer exists:
 *
 * - the unauthenticated redirect expected the **landing** login (`127.0.0.1:4321/auth/login`), but
 *   the guard has sent operators to the app's own login (`/dashboard/login?returnTo=…`) since the
 *   in-app login route landed;
 * - the public turnero expected "business not found for slug", which is the resolver's *error
 *   message*; the UI shows "Negocio no encontrado."
 *
 * Neither was caught because this suite ran in no gate. They now stub the backend they depend on,
 * so they assert the app's behaviour instead of a database's state.
 */
const protectedRoutes = ['/inicio', '/turnos', '/clientes', '/servicios', '/configuracion'];

test.describe('dashboard unauthenticated access', () => {
  for (const route of protectedRoutes) {
    test(`sends ${route} to the in-app login when there is no session`, async ({ page, baseURL }) => {
      await page.goto(`${baseURL}${route}`);

      await expect(page).toHaveURL(/\/dashboard\/login\?returnTo=/);
      await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
      await expect(page.getByRole('textbox', { name: /contrase|password/i })).toBeVisible();

      // The guard remembers where the operator was headed (the router sees the path under the
      // `/dashboard` serve path, so `returnTo` is `/inicio`, not `/dashboard/inicio`).
      const returnTo = new URL(page.url()).searchParams.get('returnTo') ?? '';
      expect(returnTo).toMatch(new RegExp(`${route.replace('/', '')}$`));
      expect(baseURL).toBe('http://127.0.0.1:4200/dashboard');
    });
  }
});

test.describe('dashboard public booking route', () => {
  test('shows the not-found state for an unknown slug without an auth redirect', async ({ page }) => {
    // The turnero resolves the slug through the constrained `resolve_business_by_slug` RPC, and the
    // settings facade maps a `BUSINESS_NOT_FOUND` error to the not-found copy. Stub that exact
    // error so the assertion is about the app's not-found state, not about a live database.
    await page.route('**/rpc/resolve_business_by_slug**', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'BUSINESS_NOT_FOUND',
          message: 'BUSINESS_NOT_FOUND: no business for slug',
          details: null,
          hint: null
        })
      });
    });

    await page.goto('/dashboard/booking/e2e-unknown-business-slug');

    await expect(page).toHaveURL(/127\.0\.0\.1:4200\/dashboard\/booking\/e2e-unknown-business-slug/);
    await expect(page.getByText('Negocio no encontrado.')).toBeVisible();
    await expect(page).not.toHaveURL(/\/dashboard\/login/);
  });
});
