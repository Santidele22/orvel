import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseAuthClientMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  getDashboardAuthState: vi.fn(),
  signOut: vi.fn()
}));

vi.mock('../../core/auth/supabase-auth.client', () => ({
  createSupabaseAuthClient: () => supabaseAuthClientMock
}));

function allowedSession() {
  return {
    data: {
      session: {
        access_token: 'supabase-access-token',
        user: {
          id: 'logout-operator',
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

describe('dashboard logout signOut contract', () => {
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

  it('retries signOut with local scope when the first attempt returns { error }', async () => {
    supabaseAuthClientMock.signOut
      .mockResolvedValueOnce({ error: { message: 'Auth session missing' } })
      .mockResolvedValueOnce({ error: null });

    const { logoutAndRedirect } = await import('../../core/auth/route-protection');
    const redirectTo = await logoutAndRedirect();

    expect(supabaseAuthClientMock.signOut).toHaveBeenNthCalledWith(1);
    expect(supabaseAuthClientMock.signOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
    expect(supabaseAuthClientMock.signOut).toHaveBeenCalledTimes(2);
    expect(redirectTo).toBe('/dashboard/auth/login?returnTo=%2Fdashboard');
  });

  it('does not treat a signOut { error } as success and does not navigate when both attempts fail', async () => {
    supabaseAuthClientMock.signOut.mockResolvedValue({ error: { message: 'network down' } });

    const { logoutAndRedirect } = await import('../../core/auth/route-protection');

    await expect(logoutAndRedirect()).rejects.toThrow(/network down/);
    expect(supabaseAuthClientMock.signOut).toHaveBeenNthCalledWith(1);
    expect(supabaseAuthClientMock.signOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
    expect(supabaseAuthClientMock.signOut).toHaveBeenCalledTimes(2);
  });

  it('denies canAccessDashboardAsync after a successful logout when getSession is null', async () => {
    let session: ReturnType<typeof allowedSession>['data']['session'] | null = allowedSession().data.session;

    supabaseAuthClientMock.getSession.mockImplementation(async () => ({
      data: { session },
      error: null
    }));
    supabaseAuthClientMock.getDashboardAuthState.mockResolvedValue(allowedAuthState());
    supabaseAuthClientMock.signOut.mockImplementation(async (options?: { scope?: string }) => {
      if (options?.scope === 'local') {
        session = null;
        return { error: null };
      }
      return { error: { message: 'global signOut failed' } };
    });

    const { canAccessDashboardAsync, logoutAndRedirect } = await import('../../core/auth/route-protection');

    await expect(canAccessDashboardAsync()).resolves.toEqual({ allowed: true });
    await logoutAndRedirect();
    await expect(canAccessDashboardAsync()).resolves.toEqual({
      allowed: false,
      redirectTo: '/dashboard/auth/login?returnTo=%2Fdashboard'
    });

    expect(supabaseAuthClientMock.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('AuthService uses the route-protection cached auth client instead of creating a second one', () => {
    const source = readFileSync(new URL('../../services/auth.service.ts', import.meta.url), 'utf8');

    expect(source).toMatch(/getSupabaseAuthClient/);
    expect(source).toMatch(/from\s+['"][^'"]*core\/auth\/route-protection['"]/);
    expect(source).not.toMatch(/createSupabaseAuthClient\s*\(/);
  });
});
