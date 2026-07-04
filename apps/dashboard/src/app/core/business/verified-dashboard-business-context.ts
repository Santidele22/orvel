import type { SupabaseClient } from '@supabase/supabase-js';
import { emitDashboardBranchRpcFailure, type DashboardOperationalSource } from '../observability/dashboard-operational-events';

export type VerifiedDashboardBranch = {
  id: string;
  name: string;
  businessId: string;
  isActive: boolean | null;
};

export class DashboardBranchContextError extends Error {
  readonly code: 'SESSION_LOOKUP_FAILED' | 'DASHBOARD_BRANCH_RPC_FAILED';

  constructor(code: DashboardBranchContextError['code']) {
    super(code === 'SESSION_LOOKUP_FAILED'
      ? 'No pudimos verificar la sesión del dashboard.'
      : 'No pudimos verificar las sucursales del dashboard. Revisá la conexión o la publicación del RPC.');
    this.name = 'DashboardBranchContextError';
    this.code = code;
  }
}

type DashboardBranchRpcRow = {
  id?: string | null;
  name?: string | null;
  business_id?: string | null;
  is_active?: boolean | null;
};

function normalizeId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export async function resolveVerifiedDashboardBranches(
  supabase: SupabaseClient,
  source: DashboardOperationalSource = 'branch-context'
): Promise<VerifiedDashboardBranch[]> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new DashboardBranchContextError('SESSION_LOOKUP_FAILED');

  const user = data.session?.user;
  if (!normalizeId(user?.id)) return [];

  const { data: branches, error: branchesError } = await supabase.rpc('get_dashboard_branches');
  if (branchesError) {
    emitDashboardBranchRpcFailure({ source, error: branchesError });
    throw new DashboardBranchContextError('DASHBOARD_BRANCH_RPC_FAILED');
  }

  return ((branches ?? []) as DashboardBranchRpcRow[])
    .map((branch) => {
      const id = normalizeId(branch.id);
      const businessId = normalizeId(branch.business_id);
      if (!id || !businessId) return null;

      return {
        id,
        name: normalizeId(branch.name) ?? 'Sucursal',
        businessId,
        isActive: typeof branch.is_active === 'boolean' ? branch.is_active : null,
      } satisfies VerifiedDashboardBranch;
    })
    .filter((branch): branch is VerifiedDashboardBranch => branch !== null);
}

export async function resolveVerifiedDashboardBusinessId(supabase: SupabaseClient): Promise<string | null> {
  const branches = await resolveVerifiedDashboardBranches(supabase, 'notifications');
  const businessIds = new Set(branches.map((branch) => branch.businessId));

  return businessIds.size === 1 ? [...businessIds][0] : null;
}
