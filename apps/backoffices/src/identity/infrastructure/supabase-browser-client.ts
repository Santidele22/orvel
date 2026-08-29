import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createOperatorSupabaseClient(): SupabaseClient {
  const url = String(import.meta.env.PUBLIC_SUPABASE_URL ?? '');
  const anonKey = String(import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '');

  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
