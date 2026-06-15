const rateLimit = new Map<string, number>();
function getClientKey(request: Request): string { return request.headers.get('x-forwarded-for') ?? request.headers.get('cf-connecting-ip') ?? request.headers.get('client-ip') ?? 'unknown'; }
export async function handleChangeSubscription(request: Request): Promise<Response> {
  const key = getClientKey(request);
  const count = (rateLimit.get(key) ?? 0) + 1;
  rateLimit.set(key, count);
  if (count > 10) return new Response(JSON.stringify({ error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' }), { status: 429 });
  return new Response(JSON.stringify({ ok: true }), { status: 202 });
}
