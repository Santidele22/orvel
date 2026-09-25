import type { SupabaseClient } from '@supabase/supabase-js';
import { createDashboardSupabaseClient } from './supabase-client.factory';
import { loadDashboardRuntimeEnv } from './dashboard-env';

// Dashboard-side client factory. Admin RPCs (Hora, turnos) must share the
// AuthService session key (`orvel.supabase.auth`). The anonymous booking
// factory must not be used here: it sends no JWT and query_admin_slot_availability
// raises UNAUTHORIZED.
export function createSupabaseClient(): SupabaseClient {
  return createDashboardSupabaseClient({ env: loadDashboardRuntimeEnv() });
}
