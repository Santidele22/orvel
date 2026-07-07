import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(),
  businessUpsert: vi.fn(),
  settingsUpsert: vi.fn(),
  rpc: vi.fn()
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
    supabaseMocks.rpc.mockReset();

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
      })),
      rpc: supabaseMocks.rpc
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
    supabaseMocks.rpc.mockResolvedValue({ data: 1, error: null });
    supabaseMocks.updateUser.mockResolvedValue({ data: { user: { id: 'user-free-1' } }, error: null });
  });

  it('uses the shared Supabase auth storage key, keeps plan out of public settings, and writes dashboard-required FREE metadata', async () => {
    const { createSupabaseOnboardingCompletionHandler } = await import(
      '../../features/onboarding/pages/signup-business-types-step.page'
    );

    const handler = createSupabaseOnboardingCompletionHandler();
    const completed = await handler({
      plan: 'FREE',
      businessType: 'peluqueria',
      selectedRubros: ['peluqueria'],
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
        business_type: 'peluqueria'
      }),
      { onConflict: 'business_id' }
    );
    const [settingsPayload] = supabaseMocks.settingsUpsert.mock.calls[0] as [Record<string, unknown>];
    expect(settingsPayload).not.toHaveProperty('plan');
    expect(settingsPayload).not.toHaveProperty('business_name');
    expect(settingsPayload).not.toHaveProperty('slug');
    expect(settingsPayload).not.toHaveProperty('timezone');
    expect(supabaseMocks.updateUser).toHaveBeenCalledWith({
      data: {
        onboardingCompleted: true,
        onboarding_completed: true,
        plan: 'FREE',
        tipoNegocio: 'peluqueria',
        businessType: 'peluqueria',
        business_type: 'peluqueria',
        selectedBusinessTypes: ['peluqueria'],
        selected_business_types: ['peluqueria'],
        additionalRubros: []
      }
    });
  });

  it('clears stale rubro metadata by always sending selected and additional rubro keys', async () => {
    const { createSupabaseOnboardingCompletionHandler } = await import(
      '../../features/onboarding/pages/signup-business-types-step.page'
    );

    const handler = createSupabaseOnboardingCompletionHandler();
    const completed = await handler({
      plan: 'FREE',
      businessType: 'peluqueria',
      selectedRubros: ['peluqueria', 'barberia'],
      storage: {
        getItem: vi.fn((key: string) =>
          key.includes('credentials') ? JSON.stringify({ business_name: 'Studio Free' }) : null
        )
      }
    });

    expect(completed).toBe(true);
    expect(supabaseMocks.updateUser).toHaveBeenCalledWith({
      data: expect.objectContaining({
        plan: 'FREE',
        businessType: 'peluqueria',
        business_type: 'peluqueria',
        selectedBusinessTypes: ['peluqueria', 'barberia'],
        selected_business_types: ['peluqueria', 'barberia'],
        additionalRubros: ['barberia']
      })
    });
  });

  it('clears stale additional rubros by sending an empty additionalRubros array when only the primary rubro remains', async () => {
    const { createSupabaseOnboardingCompletionHandler } = await import(
      '../../features/onboarding/pages/signup-business-types-step.page'
    );

    const handler = createSupabaseOnboardingCompletionHandler();
    const completed = await handler({
      plan: 'FREE',
      businessType: 'peluqueria',
      selectedRubros: [],
      storage: {
        getItem: vi.fn((key: string) =>
          key.includes('credentials') ? JSON.stringify({ business_name: 'Studio Free' }) : null
        )
      }
    });

    expect(completed).toBe(true);
    expect(supabaseMocks.updateUser).toHaveBeenCalledWith({
      data: expect.objectContaining({
        selectedBusinessTypes: ['peluqueria'],
        selected_business_types: ['peluqueria'],
        additionalRubros: []
      })
    });
    const [settingsPayload] = supabaseMocks.settingsUpsert.mock.calls[0] as [Record<string, unknown>];
    expect(settingsPayload).not.toHaveProperty('plan');
  });

  it('uses auth metadata selected business types when local rubro draft is absent', async () => {
    supabaseMocks.getSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'session-token',
          user: {
            id: 'user-free-1',
            user_metadata: {
              selected_business_types: ['peluqueria', 'barberia', 'spa']
            }
          }
        }
      },
      error: null
    });
    const { createSupabaseOnboardingCompletionHandler } = await import(
      '../../features/onboarding/pages/signup-business-types-step.page'
    );

    const handler = createSupabaseOnboardingCompletionHandler();
    const completed = await handler({
      plan: 'FREE',
      businessType: 'peluqueria',
      selectedRubros: [],
      storage: {
        getItem: vi.fn((key: string) =>
          key.includes('credentials') ? JSON.stringify({ business_name: 'Studio Free' }) : null
        )
      }
    });

    expect(completed).toBe(true);
    expect(supabaseMocks.updateUser).toHaveBeenCalledWith({
      data: expect.objectContaining({
        selectedBusinessTypes: ['peluqueria', 'barberia', 'spa'],
        selected_business_types: ['peluqueria', 'barberia', 'spa'],
        additionalRubros: ['barberia', 'spa']
      })
    });
  });
});
