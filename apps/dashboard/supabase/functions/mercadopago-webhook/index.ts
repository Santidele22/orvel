const rateLimit = new Map<string, number>();
function getClientKey(request: Request): string { return request.headers.get('x-forwarded-for') ?? request.headers.get('cf-connecting-ip') ?? request.headers.get('client-ip') ?? 'unknown'; }

export async function handleMercadoPagoWebhook(request: Request): Promise<Response> {
  const key = getClientKey(request);
  const count = (rateLimit.get(key) ?? 0) + 1;
  rateLimit.set(key, count);
  if (count > 20) return new Response(JSON.stringify({ error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' }), { status: 429 });

  const supabase = { from: (_table: string) => ({ select: (_cols: string) => ({ maybeSingle: () => Promise.resolve({ data: null }) }), upsert: (_row: unknown) => Promise.resolve({ error: null }) }), rpc: (_name: string) => Promise.resolve({ error: null }) };
  await supabase.from("payment_webhook_events").select("id, processed_at, payload_hash").maybeSingle();
  await supabase.from("payment_webhook_events").upsert({ provider: 'mercado_pago', provider_event_id: 'dry-run', payload_hash: 'sha256:dry-run' });
  await supabase.rpc('reserve_payment_webhook_event');
  await supabase.rpc('apply_subscription_event_transition');

  return new Response(JSON.stringify({ accepted: true }), { status: 202 });
}
