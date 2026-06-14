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
          access_token: 'supabase-access-token',
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

  it('dashboardAuthGuard sends authenticated incomplete users without a selected plan to landing account creation with missing-account reason', async () => {
    supabaseAuthClientMock.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'supabase-access-token',
          user: {
            id: 'session-user-missing-plan',
            email: 'session-user@orvel.pro',
            user_metadata: {
              onboardingCompleted: false,
              businessType: 'peluqueria'
            }
          }
        }
      },
      error: null
    });

    const { dashboardAuthGuard } = await import('../../core/auth/dashboard-auth.guard');
    const result = await dashboardAuthGuard({} as never, { url: '/dashboard/inicio' } as never);

    expect(result).toBe(false);
    const redirectUrl = vi.mocked(window.location.assign).mock.calls[0]?.[0] as string;
    const parsedRedirect = new URL(redirectUrl);

    expect(parsedRedirect.origin).toBe('https://orvel.pro');
    expect(parsedRedirect.pathname).toBe('/auth/signup/plan');
    expect(parsedRedirect.searchParams.get('reason')).toBe('missing_account');
    expect(parsedRedirect.searchParams.get('intent')).toBe('create_account');
    expect(parsedRedirect.searchParams.get('returnTo')).toBe('/dashboard/inicio');
    expect(window.location.assign).not.toHaveBeenCalledWith(expect.stringContaining('/auth/onboarding'));
  });

  it('dashboardAuthGuard sends authenticated incomplete users with invalid plan metadata to landing account creation with missing-account reason', async () => {
    supabaseAuthClientMock.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'supabase-access-token',
          user: {
            id: 'session-user-invalid-plan',
            email: 'invalid-plan@orvel.pro',
            user_metadata: {
              plan: 'NOT_A_PLAN',
              onboardingCompleted: false,
              businessType: 'peluqueria'
            }
          }
        }
      },
      error: null
    });

    const { dashboardAuthGuard } = await import('../../core/auth/dashboard-auth.guard');
    const result = await dashboardAuthGuard({} as never, { url: '/dashboard/inicio' } as never);

    expect(result).toBe(false);
    const redirectUrl = vi.mocked(window.location.assign).mock.calls[0]?.[0] as string;
    const parsedRedirect = new URL(redirectUrl);

    expect(parsedRedirect.origin).toBe('https://orvel.pro');
    expect(parsedRedirect.pathname).toBe('/auth/signup/plan');
    expect(parsedRedirect.searchParams.get('reason')).toBe('missing_account');
    expect(parsedRedirect.searchParams.get('intent')).toBe('create_account');
    expect(parsedRedirect.searchParams.get('returnTo')).toBe('/dashboard/inicio');
    expect(window.location.assign).not.toHaveBeenCalledWith(expect.stringContaining('/auth/onboarding'));
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
