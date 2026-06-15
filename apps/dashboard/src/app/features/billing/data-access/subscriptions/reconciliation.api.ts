import type { SupabaseClient } from '@supabase/supabase-js';

export type ReconciliationAction = {
  businessId: string;
  providerSubscriptionId: string;
  drift: 'LOCAL_ACTIVE_REMOTE_CANCELLED' | 'LOCAL_PAST_DUE_REMOTE_AUTHORIZED' | 'PERIOD_MISMATCH' | 'PLAN_MISMATCH';
  recommendedAction: 'CANCEL_LOCALLY' | 'REACTIVATE_LOCALLY' | 'SYNC_PERIOD' | 'SYNC_PLAN' | 'MANUAL_REVIEW';
};

export type ReconciliationResult = {
  scanned: number;
  driftCount: number;
  actions: ReconciliationAction[];
};

export type ReconciliationRepository = {
  runDryRun(input: { tenantId: string; nowIso: string }): Promise<ReconciliationResult>;
};

let configuredRepository: ReconciliationRepository | null = null;

export function createSupabaseReconciliationRepository(supabase: Pick<SupabaseClient, 'rpc'>): ReconciliationRepository {
  return {
    async runDryRun(input) {
      const { data, error } = await supabase.rpc('reconcile_mercadopago_subscriptions_dry_run', {
        p_tenant_id: input.tenantId,
        p_now: input.nowIso
      });

      if (error) throw new Error(error.message);

      const payload = Array.isArray(data) ? data[0] : data;
      const actions = (payload?.actions ?? []) as Array<Record<string, unknown>>;
      return {
        scanned: Number(payload?.scanned ?? 0),
        driftCount: Number(payload?.drift_count ?? actions.length),
        actions: actions.map((action) => ({
          businessId: String(action['business_id'] ?? action['businessId']),
          providerSubscriptionId: String(action['provider_subscription_id'] ?? action['providerSubscriptionId']),
          drift: String(action['drift']) as ReconciliationAction['drift'],
          recommendedAction: String(action['recommended_action'] ?? action['recommendedAction']) as ReconciliationAction['recommendedAction']
        }))
      };
    }
  };
}

export function configureReconciliationRepository(repository: ReconciliationRepository | null): void {
  configuredRepository = repository;
}

function getRepository(): ReconciliationRepository {
  if (!configuredRepository) {
    throw new Error('Reconciliation repository not configured. Wire createSupabaseReconciliationRepository() to the backend RPC.');
  }

  return configuredRepository;
}

export async function reconcileMercadoPagoSubscriptions(input: { tenantId: string; dryRun: true; nowIso: string }): Promise<ReconciliationResult> {
  if (!input.dryRun) {
    throw new Error('Only dry-run reconciliation is enabled from this backend contract.');
  }

  return getRepository().runDryRun({ tenantId: input.tenantId, nowIso: input.nowIso });
}
