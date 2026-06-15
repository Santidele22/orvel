import type { APIRoute } from 'astro';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const GET: APIRoute = async ({ request }) => {
  const requestUrl = new URL(request.url);
  const checkoutSessionId = requestUrl.searchParams.get('checkout_session_id')?.trim();

  if (!checkoutSessionId) {
    return jsonResponse({ error: 'missing_checkout_session', message: 'Falta checkout_session_id.' }, 400);
  }

  const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'checkout_config_error', message: 'La configuración no está disponible.' }, 500);
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/subscription-status?checkout_session_id=${encodeURIComponent(checkoutSessionId)}`;
  const authorization = request.headers.get('Authorization');

  const headers: Record<string, string> = {
    apikey: supabaseAnonKey,
    'x-client-info': 'orvel-landing-server-checkout-status'
  };

  if (authorization) headers.Authorization = authorization;

  try {
    const upstream = await fetch(endpoint, { method: 'GET', headers });
    const payload = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      return jsonResponse(
        {
          error: payload?.error || 'status_check_failed',
          message: payload?.message || 'No pudimos validar el estado de la suscripción.'
        },
        upstream.status
      );
    }

    return jsonResponse(payload || { status: 'pending' }, 200);
  } catch {
    return jsonResponse({ error: 'status_unavailable', message: 'Estado temporalmente no disponible.' }, 503);
  }
};
