import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseAuthClientMock = vi.hoisted(() => ({
  getSession: vi.fn()
}));

vi.mock('../../core/auth/supabase-auth.client', () => ({
  createSupabaseAuthClient: () => supabaseAuthClientMock
}));

const APP_ROUTES = new URL('../../app.routes.ts', import.meta.url);

describe('RED Contract: auth-only-on-landing dashboard boundary', () => {
  beforeEach(() => {
    vi.resetModules();
    supabaseAuthClientMock.getSession.mockReset();
    supabaseAuthClientMock.getSession.mockResolvedValue({ data: { session: null }, error: null });
    delete process.env.PUBLIC_LANDING_URL;

    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          hostname: 'dashboard.orvel.pro',
          protocol: 'https:'
        }
      },
      writable: true,
      configurable: true
    });
  });

  it('registers public in-app auth/login and auth/signup routes before the guarded dashboard', async () => {
    const routesSource = await readFile(APP_ROUTES, 'utf8');
    const loginIndex = routesSource.search(/path:\s*'auth\/login'/);
    const signupIndex = routesSource.search(/path:\s*'auth\/signup'/);
    const dashboardIndex = routesSource.search(/path:\s*'dashboard'\s*,/);
    const loginBlock = routesSource.match(/\{\s*path:\s*'auth\/login',[\s\S]*?\n\s*\}/)?.[0] ?? '';
    const signupBlock = routesSource.match(/\{\s*path:\s*'auth\/signup',[\s\S]*?\n\s*\}/)?.[0] ?? '';

    expect(loginIndex).toBeGreaterThan(-1);
    expect(signupIndex).toBeGreaterThan(-1);
    expect(loginIndex).toBeLessThan(dashboardIndex);
    expect(signupIndex).toBeLessThan(dashboardIndex);
    expect(loginBlock).toContain('loadComponent');
    expect(loginBlock).not.toContain('canActivate');
    expect(signupBlock).toContain('loadComponent');
    expect(signupBlock).not.toContain('canActivate');
    expect(routesSource).not.toMatch(/SignupCredentialsPage(?:Component)?/);
  });

  it('owns dashboard login and signup wizard files', () => {
    expect(existsSync(resolve(process.cwd(), 'src/app/features/auth/pages/in-app-login.page.ts'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'src/app/features/auth/pages/in-app-signup-wizard.page.ts'))).toBe(true);
  });

  it('redirects unauthenticated protected dashboard access to in-app /dashboard/login', async () => {
    const { canAccessDashboardAsync } = await import('../../core/auth/route-protection');

    const access = await canAccessDashboardAsync(Date.now(), '/dashboard/inicio');
    const redirect = new URL(access.redirectTo ?? '', 'https://dashboard.orvel.pro');

    expect(access.allowed).toBe(false);
    expect(access.redirectTo).not.toContain('https://orvel.pro/auth/login');
    expect(redirect.pathname).toBe('/dashboard/login');
    expect(redirect.pathname).not.toBe('/auth/login');
    expect(redirect.searchParams.get('returnTo')).toBe('/dashboard/inicio');
  });
});
