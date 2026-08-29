import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const supabaseAuthClientMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  getDashboardAuthState: vi.fn(),
  signOut: vi.fn()
}));

vi.mock('../../core/auth/supabase-auth.client', () => ({
  createSupabaseAuthClient: () => supabaseAuthClientMock
}));

describe('dashboard auth onboarding contract', () => {
  beforeEach(() => {
    vi.resetModules();
    supabaseAuthClientMock.getSession.mockReset();
    supabaseAuthClientMock.getDashboardAuthState.mockReset();
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

  it('denies dashboard access when user-writable metadata self-asserts onboarding without server auth state', async () => {
    supabaseAuthClientMock.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'supabase-access-token',
          user: {
            id: 'self-asserted-user',
            email: 'attacker@orvel.pro',
            user_metadata: {
              plan: 'PRO',
              tipoNegocio: 'peluqueria',
              onboardingCompleted: true,
              onboarding_completed: true
            }
          }
        }
      },
      error: null
    });
    supabaseAuthClientMock.getDashboardAuthState.mockResolvedValue({
      data: { dashboard_ready: false, selected_plan_code: null, business_type: null },
      error: null
    });

    const { checkSupabaseSession } = await import('../../core/auth/route-protection');
    const access = await checkSupabaseSession('/dashboard/inicio');

    expect(access.allowed).toBe(false);
    expect(access.redirectTo).not.toBeUndefined();
  });

  it('allows dashboard access only when server-controlled onboarding state is dashboard ready', async () => {
    supabaseAuthClientMock.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'supabase-access-token',
          user: {
            id: 'server-authorized-user',
            email: 'owner@orvel.pro',
            user_metadata: {
              plan: 'FREE',
              tipoNegocio: 'peluqueria',
              onboardingCompleted: false
            }
          }
        }
      },
      error: null
    });
    supabaseAuthClientMock.getDashboardAuthState.mockResolvedValue({
      data: { dashboard_ready: true, selected_plan_code: 'FREE', business_type: 'peluqueria' },
      error: null
    });

    const { checkSupabaseSession } = await import('../../core/auth/route-protection');
    await expect(checkSupabaseSession('/dashboard/inicio')).resolves.toEqual({ allowed: true });
  });

  it('dashboardAuthGuard redirects authenticated users missing onboarding to landing-owned onboarding', async () => {
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
    const redirectUrl = vi.mocked(window.location.assign).mock.calls[0]?.[0] as string;
    const parsedRedirect = new URL(redirectUrl);

    expect(parsedRedirect.origin).toBe('https://orvel.pro');
    expect(parsedRedirect.pathname).toBe('/auth/signup/onboarding');
    expect(parsedRedirect.searchParams.get('onboarding_required')).toBe('true');
    expect(parsedRedirect.searchParams.get('returnTo')).toBe('/dashboard/turnos');
    expect(redirectUrl).not.toMatch(/^\/auth\/onboarding\b/);
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

  it('dashboardAuthGuard sends missing sessions to in-app dashboard sign-in', async () => {
    supabaseAuthClientMock.getSession.mockResolvedValue({ data: { session: null }, error: null });

    const { dashboardAuthGuard } = await import('../../core/auth/dashboard-auth.guard');
    const result = await dashboardAuthGuard({} as never, { url: '/dashboard/inicio' } as never);

    expect(result).toBe(false);
    expect(window.location.assign).toHaveBeenCalledWith(
      '/auth/login?returnTo=%2Fdashboard%2Finicio'
    );
  });

  it('dashboardAuthGuard preserves /dashboard returnTo when Angular runs under /dashboard base href', async () => {
    supabaseAuthClientMock.getSession.mockResolvedValue({ data: { session: null }, error: null });
    window.location.pathname = '/dashboard/inicio';

    const { dashboardAuthGuard } = await import('../../core/auth/dashboard-auth.guard');
    const result = await dashboardAuthGuard({} as never, { url: '/inicio' } as never);

    expect(result).toBe(false);
    expect(window.location.assign).toHaveBeenCalledWith(
      '/auth/login?returnTo=%2Finicio'
    );
  });

  it('keeps /auth/onboarding as a dashboard compatibility redirect, not the real onboarding UI route', async () => {
    const routesSource = await readFile(new URL('../../app.routes.ts', import.meta.url), 'utf8');

    const onboardingRoute = routesSource.match(
      /path:\s*['"]auth\/onboarding['"][\s\S]*?redirectTo[\s\S]*?pathMatch:\s*['"]full['"]/
    )?.[0];

    expect(onboardingRoute).toBeDefined();
    expect(onboardingRoute).toContain('redirectTo');
    expect(onboardingRoute).not.toContain('signup-business-types-step.component');
    expect(onboardingRoute).not.toContain('features/onboarding/pages');
  });

  describe('in-shell dashboard auth access cache', () => {
    function allowedSession(userId = 'allowed-operator') {
      return {
        data: {
          session: {
            access_token: 'supabase-access-token',
            user: {
              id: userId,
              email: 'owner@orvel.pro',
              user_metadata: {
                plan: 'FREE',
                tipoNegocio: 'peluqueria',
                onboardingCompleted: true
              }
            }
          }
        },
        error: null
      };
    }

    function allowedAuthState() {
      return {
        data: { dashboard_ready: true, selected_plan_code: 'FREE', business_type: 'peluqueria' },
        error: null
      };
    }

    it('calls getDashboardAuthState once for two canAccessDashboardAsync checks of the same allowed user', async () => {
      supabaseAuthClientMock.getSession.mockResolvedValue(allowedSession());
      supabaseAuthClientMock.getDashboardAuthState.mockResolvedValue(allowedAuthState());

      const { canAccessDashboardAsync } = await import('../../core/auth/route-protection');

      await expect(canAccessDashboardAsync(Date.now(), '/dashboard/inicio')).resolves.toEqual({ allowed: true });
      await expect(canAccessDashboardAsync(Date.now(), '/dashboard/turnos')).resolves.toEqual({ allowed: true });

      expect(supabaseAuthClientMock.getDashboardAuthState).toHaveBeenCalledTimes(1);
    });

    it('calls getDashboardAuthState again after logoutAndRedirect', async () => {
      supabaseAuthClientMock.getSession.mockResolvedValue(allowedSession());
      supabaseAuthClientMock.getDashboardAuthState.mockResolvedValue(allowedAuthState());
      supabaseAuthClientMock.signOut.mockResolvedValue({ error: null });

      const { canAccessDashboardAsync, logoutAndRedirect } = await import('../../core/auth/route-protection');

      await expect(canAccessDashboardAsync()).resolves.toEqual({ allowed: true });
      await logoutAndRedirect();
      await expect(canAccessDashboardAsync()).resolves.toEqual({ allowed: true });

      expect(supabaseAuthClientMock.getDashboardAuthState).toHaveBeenCalledTimes(2);
    });

    it('does not reuse a denied or missing-plan result as allow', async () => {
      supabaseAuthClientMock.getSession.mockResolvedValue(allowedSession('pending-operator'));
      supabaseAuthClientMock.getDashboardAuthState
        .mockResolvedValueOnce({
          data: { dashboard_ready: false, selected_plan_code: null, business_type: null },
          error: null
        })
        .mockResolvedValueOnce(allowedAuthState());

      const { canAccessDashboardAsync } = await import('../../core/auth/route-protection');

      const denied = await canAccessDashboardAsync(Date.now(), '/dashboard/inicio');
      expect(denied.allowed).toBe(false);

      await expect(canAccessDashboardAsync(Date.now(), '/dashboard/inicio')).resolves.toEqual({ allowed: true });
      expect(supabaseAuthClientMock.getDashboardAuthState).toHaveBeenCalledTimes(2);
    });
  });
});
