import { describe, expect, it, vi } from 'vitest';

type DashboardRuntimeEnv = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

type SupabaseRpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<unknown>;
};

type SupabaseBookingGateway = {
  resolveBusinessBySlug: (input: { businessSlug: string }) => Promise<unknown>;
  createPublicBooking: (payload: unknown) => Promise<unknown>;
  manageBookingByToken: (input: { token: string; nowIso: string }) => Promise<unknown>;
  createAdminManualBooking: (payload: unknown) => Promise<unknown>;
  createAdminBlockedTime: (payload: unknown) => Promise<unknown>;
};

type BootstrapOk = {
  status: 'ok';
  provider: 'supabase';
};

type BootstrapError = {
  status: 'error';
  code: 'MISSING_ENV';
  message: string;
  action: 'ADD_ENV_AND_RESTART';
  missingEnv: Array<'SUPABASE_URL' | 'SUPABASE_ANON_KEY'>;
};

type SupabaseBookingBootstrapModule = {
  bootstrapDashboardBookingGateway: (deps: {
    loadDashboardRuntimeEnv: () => DashboardRuntimeEnv;
    createDashboardSupabaseClient: (input: { env: DashboardRuntimeEnv }) => SupabaseRpcClient;
    createSupabaseBookingGateway: (input: { client: SupabaseRpcClient }) => SupabaseBookingGateway;
    setSupabaseBookingGateway: (gateway: SupabaseBookingGateway) => void;
  }) => BootstrapOk | BootstrapError;
};

async function loadBootstrapModule(): Promise<SupabaseBookingBootstrapModule> {
  try {
    const mod = await import('../../core/runtime/supabase-booking.bootstrap');
    return mod as SupabaseBookingBootstrapModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/runtime/supabase-booking.bootstrap.ts exporting bootstrapDashboardBookingGateway({ loadDashboardRuntimeEnv, createDashboardSupabaseClient, createSupabaseBookingGateway, setSupabaseBookingGateway })'
    );
  }
}

describe('Supabase runtime bootstrap RED contracts (wiring + injection point)', () => {
  it('initializes booking gateway through a real Supabase-like client injection point', async () => {
    const bootstrap = await loadBootstrapModule();

    const env: DashboardRuntimeEnv = {
      SUPABASE_URL: 'https://qa-project.supabase.co',
      SUPABASE_ANON_KEY: 'qa-anon-key'
    };

    const loadDashboardRuntimeEnv = vi.fn(() => env);

    const supabaseClient: SupabaseRpcClient = {
      rpc: vi.fn(async () => ({ data: null, error: null }))
    };

    const createDashboardSupabaseClient = vi.fn(({ env: inputEnv }: { env: DashboardRuntimeEnv }) => {
      expect(inputEnv).toBe(env);
      return supabaseClient;
    });

    const gateway: SupabaseBookingGateway = {
      resolveBusinessBySlug: vi.fn(async () => ({ status: 200 })),
      createPublicBooking: vi.fn(async () => ({ status: 201 })),
      manageBookingByToken: vi.fn(async () => ({ status: 200 })),
      createAdminManualBooking: vi.fn(async () => ({ status: 201 })),
      createAdminBlockedTime: vi.fn(async () => ({ status: 201 }))
    };

    const createSupabaseBookingGateway = vi.fn(({ client }: { client: SupabaseRpcClient }) => {
      expect(client).toBe(supabaseClient);
      return gateway;
    });

    const setSupabaseBookingGateway = vi.fn();

    const result = bootstrap.bootstrapDashboardBookingGateway({
      loadDashboardRuntimeEnv,
      createDashboardSupabaseClient,
      createSupabaseBookingGateway,
      setSupabaseBookingGateway
    });

    expect(loadDashboardRuntimeEnv).toHaveBeenCalledTimes(1);
    expect(createDashboardSupabaseClient).toHaveBeenCalledTimes(1);
    expect(createSupabaseBookingGateway).toHaveBeenCalledTimes(1);
    expect(setSupabaseBookingGateway).toHaveBeenCalledTimes(1);
    expect(setSupabaseBookingGateway).toHaveBeenCalledWith(gateway);
    expect(result).toEqual({
      status: 'ok',
      provider: 'supabase'
    });
  });

  it('returns deterministic actionable status when env is missing (no silent failure)', async () => {
    const bootstrap = await loadBootstrapModule();

    const loadDashboardRuntimeEnv = vi.fn(() => {
      throw new Error(
        '[dashboard-env] Missing required env vars: SUPABASE_URL, SUPABASE_ANON_KEY. Add them to .env and restart dashboard runtime.'
      );
    });

    const createDashboardSupabaseClient = vi.fn(() => ({ rpc: vi.fn() }));
    const createSupabaseBookingGateway = vi.fn(() => {
      throw new Error('should not execute when env is missing');
    });
    const setSupabaseBookingGateway = vi.fn();

    const result = bootstrap.bootstrapDashboardBookingGateway({
      loadDashboardRuntimeEnv,
      createDashboardSupabaseClient,
      createSupabaseBookingGateway,
      setSupabaseBookingGateway
    });

    expect(createDashboardSupabaseClient).not.toHaveBeenCalled();
    expect(createSupabaseBookingGateway).not.toHaveBeenCalled();
    expect(setSupabaseBookingGateway).not.toHaveBeenCalled();

    expect(result).toEqual({
      status: 'error',
      code: 'MISSING_ENV',
      message:
        '[dashboard-env] Missing required env vars: SUPABASE_URL, SUPABASE_ANON_KEY. Add them to .env and restart dashboard runtime.',
      action: 'ADD_ENV_AND_RESTART',
      missingEnv: ['SUPABASE_URL', 'SUPABASE_ANON_KEY']
    });
  });
});
