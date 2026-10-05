import { type SupabaseClient } from '@supabase/supabase-js';
import { createDashboardSupabaseClient } from './supabase-client.factory';
import { loadDashboardRuntimeEnv } from '../../runtime/dashboard-env';
import type {
  BranchContextSource,
  BranchSessionSnapshot,
  OwnedBusinessRow
} from '../../branches/branch-context.port';

/**
 * Fase 1 of #1098 — the Supabase implementation of the branch-context port.
 *
 * The client is created on first use, exactly as the service used to do it, so
 * booting the app does not build a Supabase client until someone needs the
 * operator context.
 */
export function createSupabaseBranchContextSource(): BranchContextSource {
  let client: SupabaseClient | undefined;

  const getClient = (): SupabaseClient => {
    const existing = client;
    if (existing) {
      return existing;
    }

    const created = createDashboardSupabaseClient({ env: loadDashboardRuntimeEnv() });
    client = created;
    return created;
  };

  return {
    async readSession(): Promise<BranchSessionSnapshot | null> {
      const { data, error } = await getClient().auth.getSession();
      if (error) {
        throw error;
      }

      const user = data.session?.user;
      if (!user) {
        return null;
      }

      const userId = typeof user.id === 'string' ? user.id.trim() : '';
      return {
        userId: userId || null,
        userMetadata: user.user_metadata as Record<string, unknown> | undefined
      };
    },

    async listDashboardBranches(businessId: string): Promise<Array<Record<string, unknown>>> {
      const { data, error } = await getClient().rpc('get_dashboard_branches', {
        p_business_id: businessId
      });

      if (error) {
        throw error;
      }

      return (data ?? []) as Array<Record<string, unknown>>;
    },

    async listOwnedBusinesses(ownerId: string): Promise<OwnedBusinessRow[]> {
      const { data, error } = await getClient()
        .from('businesses')
        .select('id, owner_id, slug, name')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      return ((data ?? []) as Array<{ id?: unknown; owner_id?: unknown; slug?: unknown; name?: unknown }>)
        .map((row) => ({
          id: typeof row.id === 'string' ? row.id.trim() : '',
          owner_id: typeof row.owner_id === 'string' ? row.owner_id : undefined,
          slug: typeof row.slug === 'string' ? row.slug : undefined,
          name: typeof row.name === 'string' ? row.name : undefined
        }))
        .filter((row) => row.id.length > 0);
    }
  };
}
