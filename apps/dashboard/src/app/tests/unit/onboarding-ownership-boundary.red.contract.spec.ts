import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const supabaseAuthClientMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn()
}));

vi.mock('../../core/auth/supabase-auth.client', () => ({
  createSupabaseAuthClient: () => supabaseAuthClientMock
}));

describe('RED contract: dashboard is authenticated app only, not canonical onboarding owner', () => {
  beforeEach(() => {
    vi.resetModules();
    supabaseAuthClientMock.getSession.mockReset();
    supabaseAuthClientMock.signOut.mockReset();

    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          assign: vi.fn(),
          hostname: 'dashboard.orvel.pro',
          protocol: 'https:'
        }
      },
      writable: true,
      configurable: true
    });
  });

  it('does not register dashboard /auth/onboarding as the real onboarding UI route', async () => {
    const routesSource = await readFile(new URL('../../app.routes.ts', import.meta.url), 'utf8');
    const onboardingRoute = routesSource.match(/path:\s*['"]auth\/onboarding['"][\s\S]*?(?=\n\s*\},\n\s*\{|\n\s*\}\n\];)/)?.[0] ?? '';

    expect(onboardingRoute).toBeTruthy();
    expect(onboardingRoute).not.toContain('signup-business-types-step.component');
    expect(onboardingRoute).not.toContain('features/onboarding/pages');
    expect(onboardingRoute).toMatch(/redirectTo|UrlTree|landing|compat/i);
  });

  it('redirects authenticated incomplete users with selected plan to landing onboarding compatibility target, not dashboard self-loop', async () => {
    supabaseAuthClientMock.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'supabase-access-token',
          user: {
            id: 'incomplete-free-user',
            email: 'incomplete@orvel.pro',
            user_metadata: {
              plan: 'FREE',
              onboardingCompleted: false,
              onboarding_completed: false
            }
          }
        }
      },
      error: null
    });

    const { dashboardAuthGuard } = await import('../../core/auth/dashboard-auth.guard');
    const result = await dashboardAuthGuard({} as never, { url: '/auth/onboarding?plan=FREE' } as never);

    expect(result).toBe(false);
    const redirectUrl = vi.mocked(window.location.assign).mock.calls[0]?.[0] as string;
    expect(redirectUrl).toBeTruthy();
    expect(redirectUrl).not.toMatch(/^\/auth\/onboarding\b/);
    expect(redirectUrl).not.toContain('returnTo=%2Fauth%2Fonboarding');

    const parsedRedirect = new URL(redirectUrl, 'https://dashboard.orvel.pro');
    expect(parsedRedirect.origin).toBe('https://orvel.pro');
    expect(parsedRedirect.pathname).toMatch(/onboarding|signup/);
    expect(parsedRedirect.searchParams.get('returnTo')).not.toContain('/auth/onboarding');
  });
});
