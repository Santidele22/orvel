import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseAuthClientMock = vi.hoisted(() => ({
  getSession: vi.fn()
}));

vi.mock('../../core/auth/supabase-auth.client', () => ({
  createSupabaseAuthClient: () => supabaseAuthClientMock
}));

const APP_ROUTES = new URL('../../app.routes.ts', import.meta.url);
const DASHBOARD_AUTH_DIR = new URL('../../pages/auth', import.meta.url);

async function listFiles(dir: URL): Promise<string[]> {
  if (!existsSync(dir)) {
    return [];
  }

  const root = dir.pathname;
  const output: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFiles(new URL(`${absolute}/`, 'file://'));
      output.push(...nested.map(file => relative(root, join(root, file))));
      continue;
    }

    if ((await stat(absolute)).isFile()) {
      output.push(relative(root, absolute));
    }
  }

  return output.sort();
}

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

  it('does not register or lazy-import dashboard pages/auth routes', async () => {
    const routesSource = await readFile(APP_ROUTES, 'utf8');
    const loginIndex = routesSource.search(/path:\s*'dashboard\/login'/);
    const dashboardIndex = routesSource.search(/path:\s*'dashboard'\s*,/);
    const loginBlock = routesSource.match(/\{\s*path:\s*'dashboard\/login',[\s\S]*?\n\s*\}/)?.[0] ?? '';

    expect(loginIndex).toBeGreaterThan(-1);
    expect(loginIndex).toBeLessThan(dashboardIndex);
    expect(loginBlock).toContain('loadComponent');
    expect(loginBlock).not.toContain('canActivate');
    expect(routesSource).not.toMatch(/path:\s*['"]auth(?:\/login)?['"]/);
    expect(routesSource).not.toMatch(/path:\s*['"]login['"]/);
    expect(routesSource).not.toMatch(/['"]\.\/pages\/auth/);
    expect(routesSource).not.toMatch(/LoginPage|SignupCredentialsPage(?:Component)?/);
  });

  it('does not require dashboard-owned login/signup page or component files', async () => {
    const files = await listFiles(DASHBOARD_AUTH_DIR);

    expect(files).toEqual([]);
  });

  it('redirects unauthenticated protected dashboard access to in-app dashboard sign-in', async () => {
    const { canAccessDashboardAsync } = await import('../../core/auth/route-protection');

    const access = await canAccessDashboardAsync(Date.now(), '/dashboard/inicio');
    const redirect = new URL(access.redirectTo ?? '', 'https://dashboard.orvel.pro');

    expect(access.allowed).toBe(false);
    expect(access.redirectTo).not.toContain('https://orvel.pro/auth/login');
    expect(redirect.pathname).toBe('/dashboard/login');
    expect(redirect.searchParams.get('returnTo')).toBe('/dashboard/inicio');
  });
});
