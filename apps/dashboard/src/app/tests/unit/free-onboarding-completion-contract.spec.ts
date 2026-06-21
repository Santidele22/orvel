import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(),
  businessUpsert: vi.fn(),
  settingsUpsert: vi.fn()
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseMocks.createClient
}));

describe('free onboarding completion contract', () => {
  beforeEach(() => {
    vi.resetModules();
    supabaseMocks.createClient.mockReset();
    supabaseMocks.getSession.mockReset();
    supabaseMocks.updateUser.mockReset();
    supabaseMocks.businessUpsert.mockReset();
    supabaseMocks.settingsUpsert.mockReset();

    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() } },
      writable: true,
      configurable: true
    });

    supabaseMocks.createClient.mockReturnValue({
      auth: {
        getSession: supabaseMocks.getSession,
        updateUser: supabaseMocks.updateUser
      },
      from: vi.fn((table: string) => ({
        upsert: table === 'businesses' ? supabaseMocks.businessUpsert : supabaseMocks.settingsUpsert
      }))
    });
    supabaseMocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'session-token',
          user: { id: 'user-free-1' }
        }
      },
      error: null
    });
    supabaseMocks.businessUpsert.mockResolvedValue({ error: null });
    supabaseMocks.settingsUpsert.mockResolvedValue({ error: null });
    supabaseMocks.updateUser.mockResolvedValue({ data: { user: { id: 'user-free-1' } }, error: null });
  });

  it('uses the shared Supabase auth storage key and writes dashboard-required FREE metadata', async () => {
    const { createSupabaseOnboardingCompletionHandler } = await import(
      '../../features/onboarding/pages/signup-business-types-step.page'
    );

    const handler = createSupabaseOnboardingCompletionHandler();
    const completed = await handler({
      plan: 'FREE',
      businessType: 'peluqueria',
      storage: {
        getItem: vi.fn((key: string) =>
          key.includes('credentials') ? JSON.stringify({ business_name: 'Studio Free' }) : null
        )
      }
    });

    expect(completed).toBe(true);
    expect(supabaseMocks.createClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        auth: expect.objectContaining({
          storageKey: 'orvel.supabase.auth',
          persistSession: true,
          flowType: 'pkce'
        })
      })
    );
    expect(supabaseMocks.businessUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-free-1', name: 'Studio Free', owner_id: 'user-free-1' }),
      { onConflict: 'id' }
    );
    expect(supabaseMocks.settingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        business_id: 'user-free-1',
        business_name: 'Studio Free',
        business_type: 'peluqueria',
        plan: 'free'
      }),
      { onConflict: 'business_id' }
    );
    expect(supabaseMocks.updateUser).toHaveBeenCalledWith({
      data: {
        onboardingCompleted: true,
        onboarding_completed: true,
        plan: 'FREE',
        tipoNegocio: 'peluqueria',
        businessType: 'peluqueria',
        business_type: 'peluqueria'
      }
    });
  });
});
