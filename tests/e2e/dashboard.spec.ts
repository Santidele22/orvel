import { expect, test } from '@playwright/test';

const protectedRoutes = [
  '/inicio',
  '/turnos',
  '/clientes',
  '/servicios',
  '/configuracion'
];

test.describe('dashboard unauthenticated access', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('http://127.0.0.1:4321/auth/login**', async route => {
      const target = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html>
          <html lang="es">
            <title>Orvel login E2E stub</title>
            <body>
              <main>
                <h1>Bienvenido</h1>
                <input id="email" aria-label="Email" />
                <input id="password" aria-label="Password" type="password" />
                <button>Entrar al dashboard</button>
                <p data-testid="return-to">${target.searchParams.get('returnTo') ?? ''}</p>
              </main>
            </body>
          </html>`
      });
    });
  });

  for (const route of protectedRoutes) {
    test(`redirects ${route} to landing login`, async ({ page, baseURL }) => {
      await page.goto(`${baseURL}${route}`);

      await expect(page).toHaveURL(/127\.0\.0\.1:4321\/auth\/login/);
      await expect(page.getByRole('heading', { name: /bienvenido/i })).toBeVisible();
      await expect(page.locator('#email')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.getByRole('button', { name: /entrar al dashboard/i })).toBeVisible();

      const currentUrl = new URL(page.url());
      expect(currentUrl.searchParams.get('returnTo')).toBe(`/dashboard${route}`);
      expect(baseURL).toBe('http://127.0.0.1:4200/dashboard');
    });
  }
});

test.describe('dashboard public booking route', () => {
  test('loads the public booking surface for an unknown slug without auth redirect', async ({ page }) => {
    await page.goto('/dashboard/booking/e2e-unknown-business-slug');

    await expect(page).toHaveURL(/127\.0\.0\.1:4200\/dashboard\/booking\/e2e-unknown-business-slug/);
    await expect(page.getByText(/business not found for slug/i)).toBeVisible();
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });
});

test.describe('dashboard documented demo login diagnostics', () => {
  test.skip('attempts checked-in demo credentials and reaches dashboard when backend state allows it', async ({ page }) => {
    await page.goto('/dashboard/inicio');
    await expect(page).toHaveURL(/127\.0\.0\.1:4321\/auth\/login/);

    await page.locator('#email').fill('demo@turnea.app');
    await page.locator('#password').fill('demo1234');
    await page.getByRole('button', { name: /entrar al dashboard/i }).click();

    await expect(page).toHaveURL(/127\.0\.0\.1:4200\/dashboard\/inicio/, { timeout: 20_000 });
    await expect(page.getByTestId('dashboard-shell-responsive-root')).toBeVisible();
    await expect(page.getByTestId('content')).toBeVisible();
  });
});
