import { REQUIRED_DASHBOARD_ENV_KEYS, type DashboardRuntimeEnv } from './dashboard-env';

type RequiredDashboardEnvKey = (typeof REQUIRED_DASHBOARD_ENV_KEYS)[number];

type CreateSupabaseBookingGateway = typeof import('../api/supabase-booking.gateway').createSupabaseBookingGateway;
type SetSupabaseBookingGateway = typeof import('../api/supabase-booking.api').setSupabaseBookingGateway;
type SupabaseRpcClient = Parameters<CreateSupabaseBookingGateway>[0]['client'];

type BootstrapOk = {
  status: 'ok';
  provider: 'supabase';
};

type BootstrapError = {
  status: 'error';
  code: 'MISSING_ENV';
  message: string;
  action: 'ADD_ENV_AND_RESTART';
  missingEnv: RequiredDashboardEnvKey[];
};

type BootstrapDeps = {
  loadDashboardRuntimeEnv: () => DashboardRuntimeEnv;
  createDashboardSupabaseClient: (input: { env: DashboardRuntimeEnv }) => SupabaseRpcClient;
  createSupabaseBookingGateway: CreateSupabaseBookingGateway;
  setSupabaseBookingGateway: SetSupabaseBookingGateway;
};

const MISSING_ENV_ERROR_PREFIX = '[dashboard-env] Missing required env vars:';

function toErrorMessage(input: unknown): string {
  if (input instanceof Error) {
    return input.message;
  }

  return String(input);
}

export function bootstrapDashboardBookingGateway(deps: BootstrapDeps): BootstrapOk | BootstrapError {
  try {
    const env = deps.loadDashboardRuntimeEnv();
    const client = deps.createDashboardSupabaseClient({ env });
    const gateway = deps.createSupabaseBookingGateway({ client });

    deps.setSupabaseBookingGateway(gateway);

    return {
      status: 'ok',
      provider: 'supabase'
    };
  } catch (error) {
    const message = toErrorMessage(error);

    if (!message.startsWith(MISSING_ENV_ERROR_PREFIX)) {
      throw error;
    }

    return {
      status: 'error',
      code: 'MISSING_ENV',
      message,
      action: 'ADD_ENV_AND_RESTART',
      missingEnv: [...REQUIRED_DASHBOARD_ENV_KEYS]
    };
  }
}
