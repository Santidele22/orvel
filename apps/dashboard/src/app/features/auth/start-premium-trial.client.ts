export type StartPremiumTrialOutcome =
  | 'started'
  | 'already_premium'
  | 'already_trialing'
  | 'trial_already_used'
  | 'unavailable';

export type StartPremiumTrialResult =
  | { ok: true; outcome: 'started' | 'already_premium' | 'already_trialing' }
  | { ok: false; outcome: 'trial_already_used' | 'unavailable'; message: string };

export type StartPremiumTrialRpcResult = {
  data: unknown;
  error: { message?: string } | null;
};

export type StartPremiumTrialRpc = {
  rpc: (
    fn: 'start_premium_trial',
    args: { p_business_id: string }
  ) => PromiseLike<StartPremiumTrialRpcResult>;
};

const TRIAL_ALREADY_USED_MESSAGE = 'Este negocio ya usó la prueba de Premium.';
const UNAVAILABLE_MESSAGE = 'No pudimos activar la prueba. Reintentá en unos segundos.';

function readOutcome(data: unknown): string {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return '';
  const outcome = (row as { outcome?: unknown }).outcome;
  return typeof outcome === 'string' ? outcome : '';
}

export async function startPremiumTrialForCurrentBusiness(
  businessId: string,
  client: StartPremiumTrialRpc
): Promise<StartPremiumTrialResult> {
  const { data, error } = await client.rpc('start_premium_trial', { p_business_id: businessId });
  if (error) {
    const message = error.message ?? '';
    if (message.toLowerCase().includes('trial_already_used')) {
      return { ok: false, outcome: 'trial_already_used', message: TRIAL_ALREADY_USED_MESSAGE };
    }
    return { ok: false, outcome: 'unavailable', message: UNAVAILABLE_MESSAGE };
  }

  const outcome = readOutcome(data) as StartPremiumTrialOutcome;
  if (outcome === 'trial_already_used') {
    return { ok: false, outcome, message: TRIAL_ALREADY_USED_MESSAGE };
  }
  if (outcome === 'started' || outcome === 'already_premium' || outcome === 'already_trialing') {
    return { ok: true, outcome };
  }
  return { ok: false, outcome: 'unavailable', message: UNAVAILABLE_MESSAGE };
}
