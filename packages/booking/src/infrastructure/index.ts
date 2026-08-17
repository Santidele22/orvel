// @orvel/booking/infrastructure public surface barrel.
// Infra layer: Supabase adapters + DI wiring. Angular DI is allowed HERE ONLY
// (SupabaseClient injection); no Angular components/templates/pwa.

export { SUPABASE_CLIENT } from './supabase/supabase-client.token';
export { createSupabaseClient } from './supabase/supabase-client.factory';
