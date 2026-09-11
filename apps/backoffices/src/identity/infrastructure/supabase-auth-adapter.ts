import type { Session, SupabaseClient } from '@supabase/supabase-js';

export type OperatorAuthPort = {
  getSession(): Promise<Session | null>;
  signInWithPassword(email: string, password: string): Promise<{ errorMessage: string | null }>;
  signOut(): Promise<void>;
};

export function createSupabaseAuthAdapter(client: SupabaseClient): OperatorAuthPort {
  return {
    async getSession() {
      const { data } = await client.auth.getSession();
      return data.session ?? null;
    },
    async signInWithPassword(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      return { errorMessage: error?.message ?? null };
    },
    async signOut() {
      await client.auth.signOut();
    },
  };
}
