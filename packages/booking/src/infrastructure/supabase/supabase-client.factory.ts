import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseClientEnv {
  url: string;
  anonKey: string;
}

const LEGACY_PUBLIC_SUPABASE_URL_KEY = 'NEXT_PUBLIC_SUPABASE_URL';
const LEGACY_PUBLIC_SUPABASE_ANON_KEY = 'NEXT_PUBLIC_SUPABASE_ANON_KEY';

function readRuntimeEnv(): SupabaseClientEnv {
  const maybeProcess = globalThis as {
    process?: {
      env?: Record<string, string | undefined>;
    };
  };
  const source = maybeProcess.process?.env ?? {};

  return {
    url: source['PUBLIC_SUPABASE_URL'] ?? source[LEGACY_PUBLIC_SUPABASE_URL_KEY] ?? '',
    anonKey: source['PUBLIC_SUPABASE_ANON_KEY'] ?? source[LEGACY_PUBLIC_SUPABASE_ANON_KEY] ?? ''
  };
}

// Thin anonymous Supabase client factory for @orvel/booking infrastructure.
// Consumers that resolve a client from a build-time environment (for example
// the Angular dashboard, which reads environments/environment.ts) must pass the
// resolved env explicitly; the zero-arg form reads runtime env for node/test
// runtimes that populate process.env.
export function createSupabaseClient(env?: SupabaseClientEnv): SupabaseClient {
  const resolved = env ?? readRuntimeEnv();

  if (!resolved.url || !resolved.anonKey) {
    throw new Error(
      '[supabase-client] Missing required Supabase env vars. Provide env or set PUBLIC_SUPABASE_URL/PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  return createClient(resolved.url, resolved.anonKey);
}
