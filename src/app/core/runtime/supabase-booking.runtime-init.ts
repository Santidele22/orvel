import { createClient } from '@supabase/supabase-js';
import { createSupabaseBookingGateway } from '../api/supabase-booking.gateway';
import { setSupabaseBookingGateway } from '../api/supabase-booking.api';
import { loadDashboardRuntimeEnv, type DashboardRuntimeEnv } from './dashboard-env';
import { createDashboardSupabaseClient } from './supabase-client.factory';
import { bootstrapDashboardBookingGateway } from './supabase-booking.bootstrap';

type SupabaseRpcError = {
  code?: string;
  message: string;
  details?: unknown;
};

type SupabaseRpcResult = {
  data: unknown;
  error: SupabaseRpcError | null;
};

type SupabaseRpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<SupabaseRpcResult>;
};

type RuntimeBootstrapStatus = ReturnType<typeof bootstrapDashboardBookingGateway>;

function createOfficialSupabaseClient(url: string, anonKey: string): SupabaseRpcClient {
  return createClient(url, anonKey) as unknown as SupabaseRpcClient;
}

function createRuntimeSupabaseClient({ env }: { env: DashboardRuntimeEnv }): SupabaseRpcClient {
  return createDashboardSupabaseClient<SupabaseRpcClient>({
    env,
    createClient: createOfficialSupabaseClient
  });
}

export function initializeDashboardSupabaseBookingGateway(): RuntimeBootstrapStatus {
  return bootstrapDashboardBookingGateway({
    loadDashboardRuntimeEnv,
    createDashboardSupabaseClient: createRuntimeSupabaseClient,
    createSupabaseBookingGateway,
    setSupabaseBookingGateway
  });
}
