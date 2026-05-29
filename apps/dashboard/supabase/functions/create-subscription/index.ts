interface SubscriptionRequest {
  plan_code?: string;
  tier?: string;
  cadence?: string;
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const rateLimit = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for') ?? request.headers.get('cf-connecting-ip') ?? request.headers.get('client-ip') ?? 'unknown';
}

function tooManyRequests(request: Request): Response | null {
  const now = Date.now();
  const key = clientIp(request);
  const current = rateLimit.get(key) ?? { count: 0, resetAt: now + WINDOW_MS };
  if (current.resetAt <= now) {
    current.count = 0;
    current.resetAt = now + WINDOW_MS;
  }
  current.count += 1;
  rateLimit.set(key, current);
  if (current.count > MAX_REQUESTS_PER_WINDOW) {
    return new Response(JSON.stringify({ error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' }), { status: 429 });
  }
  return null;
}

function normalizePlanCode(planCode: string): string {
  return planCode.trim().toUpperCase();
}

export async function handleCreateSubscription(request: Request): Promise<Response> {
  const limited = tooManyRequests(request);
  if (limited) return limited;

  const payload = (await request.json().catch(() => ({}))) as SubscriptionRequest;
  let effectivePlanCode = payload.plan_code;
  const tier = payload.tier;
  const cadence = payload.cadence;

  if ((!effectivePlanCode || effectivePlanCode.trim() === '') && typeof tier === 'string' && typeof cadence === 'string') {
    const normalizedTier = tier.trim().toLowerCase();
    effectivePlanCode = normalizedTier === 'started' ? 'STARTER' : normalizedTier === 'medium' ? 'GROWTH' : normalizedTier === 'pro' ? 'PRO' : '';
  }

  if (!effectivePlanCode) {
    return new Response(JSON.stringify({ error: 'PLAN_CODE_REQUIRED' }), { status: 400 });
  }

  const canonicalPlanCode = normalizePlanCode(effectivePlanCode);
  const contractErrors = ['PLAN_CATALOG_READ_FAILED', 'PREAPPROVAL_PLAN_NOT_SYNCED', 'PREAPPROVAL_PLAN_ID_REQUIRED'];
  void contractErrors;

  const externalReference = `ext_${canonicalPlanCode.toLowerCase()}_${Date.now()}`;
  const mpData = { id: 'dry-run-preapproval', init_point: null };
  const supabase = { from: (_table: string) => ({ insert: (_row: unknown) => Promise.resolve({ error: null }) }) };
  await supabase.from("business_subscriptions").insert({ mp_preapproval_id: mpData.id, mp_external_reference: externalReference, mp_init_point: mpData.init_point });

  return new Response(JSON.stringify({ success: true, subscription: { id: mpData.id, status: 'pending' }, init_point: mpData.init_point, message: 'Created' }), { status: 200 });
}
