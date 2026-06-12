import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const supabaseAuthClientMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn()
}));

vi.mock('../../core/auth/supabase-auth.client', () => ({
  createSupabaseAuthClient: () => supabaseAuthClientMock
}));

describe('dashboard auth onboarding contract', () => {
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

  it('dashboardAuthGuard honors access.redirectTo for authenticated users missing onboarding', async () => {
    supabaseAuthClientMock.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'oauth-token',
          user: {
            id: 'user-1',
            email: 'santi@orvel.pro',
            user_metadata: {
              plan: 'FREE',
              onboardingCompleted: false
            }
          }
        }
      },
      error: null
    });

    const { dashboardAuthGuard } = await import('../../core/auth/dashboard-auth.guard');
    const result = await dashboardAuthGuard({} as never, { url: '/dashboard/turnos' } as never);

    expect(result).toBe(false);
    expect(window.location.assign).toHaveBeenCalledWith(
      '/auth/onboarding?onboarding_required=true&returnTo=%2Fdashboard%2Fturnos'
    );
  });

  it('dashboardAuthGuard sends missing sessions to canonical landing login', async () => {
    supabaseAuthClientMock.getSession.mockResolvedValue({ data: { session: null }, error: null });

    const { dashboardAuthGuard } = await import('../../core/auth/dashboard-auth.guard');
    const result = await dashboardAuthGuard({} as never, { url: '/dashboard/inicio' } as never);

    expect(result).toBe(false);
    expect(window.location.assign).toHaveBeenCalledWith(
      'https://orvel.pro/auth/login?returnTo=%2Fdashboard%2Finicio'
    );
  });

  it('registers /auth/onboarding as the real incomplete-onboarding completion route', async () => {
    const routesSource = await readFile(new URL('../../app.routes.ts', import.meta.url), 'utf8');

    const onboardingRoute = routesSource.match(/path:\s*['"]auth\/onboarding['"][\s\S]*?(?=\n\s*\},\n\s*\{|\n\s*\}\n\];)/)?.[0];

    expect(onboardingRoute).toBeDefined();
    expect(onboardingRoute).toContain('signup-business-types-step.component');
    expect(onboardingRoute).not.toContain('redirectTo');
  });
});
