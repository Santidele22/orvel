import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseAuthClientMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn()
}));

vi.mock('../../core/auth/supabase-auth.client', () => ({
  createSupabaseAuthClient: () => supabaseAuthClientMock
}));

describe('Feature B contract: dashboard guard plan classification', () => {
  beforeEach(() => {
    vi.resetModules();
    supabaseAuthClientMock.getSession.mockReset();
    supabaseAuthClientMock.signOut.mockReset();
  });

  it('does not misclassify a valid selected plan as missing while onboarding is incomplete', async () => {
    supabaseAuthClientMock.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'valid-session-token',
          user: {
            id: 'user-with-valid-plan',
            email: 'valid-plan@orvel.pro',
            user_metadata: {
              plan: 'STARTER',
              onboardingCompleted: false
            }
          }
        }
      },
      error: null
    });

    const { checkSupabaseSession } = await import('../../core/auth/route-protection');
    const access = await checkSupabaseSession('/dashboard/inicio');

    expect(access.allowed).toBe(false);
    expect(access.redirectTo).toBe('/auth/onboarding?onboarding_required=true&returnTo=%2Fdashboard%2Finicio');
    expect(access.redirectTo).not.toContain('/auth/signup/plan');
    expect(access.redirectTo).not.toContain('missing_account');
  });

  it('sends authenticated incomplete FREE users with selected plan to dashboard onboarding, not landing plan selection', async () => {
    supabaseAuthClientMock.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'valid-free-session-token',
          user: {
            id: 'incomplete-free-user',
            email: 'free-incomplete@orvel.pro',
            user_metadata: {
              plan: 'FREE',
              tipoNegocio: 'pendiente',
              onboardingCompleted: false,
              onboarding_completed: false
            }
          }
        }
      },
      error: null
    });

    const { checkSupabaseSession } = await import('../../core/auth/route-protection');
    const access = await checkSupabaseSession('/dashboard/inicio');

    expect(access.allowed).toBe(false);
    expect(access.redirectTo).toBe('/auth/onboarding?onboarding_required=true&returnTo=%2Fdashboard%2Finicio');
    expect(access.redirectTo).not.toContain('/auth/signup/plan');
    expect(access.redirectTo).not.toContain('missing_account');
  });

  it('continues to send missing or invalid plan sessions to landing plan-first account creation', async () => {
    supabaseAuthClientMock.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'valid-session-token',
          user: {
            id: 'user-without-valid-plan',
            email: 'missing-plan@orvel.pro',
            user_metadata: {
              plan: 'NOT_A_PLAN',
              onboardingCompleted: false
            }
          }
        }
      },
      error: null
    });

    const { checkSupabaseSession } = await import('../../core/auth/route-protection');
    const access = await checkSupabaseSession('/dashboard/inicio');

    expect(access.allowed).toBe(false);
    expect(access.redirectTo).toContain('/auth/signup/plan');
    expect(access.redirectTo).toContain('reason=missing_account');
    expect(access.redirectTo).toContain('intent=create_account');
  });
});
