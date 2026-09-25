import type { APIRoute } from 'astro';

import { appendSupabaseAuthorizationHeader } from '../../../lib/supabaseAuthorization';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const GET: APIRoute = async ({ request }) => {
  const requestUrl = new URL(request.url);
  const subscriptionSessionId = requestUrl.searchParams.get('subscription_session_id')?.trim()
    || requestUrl.searchParams.get('preapproval_id')?.trim();

  if (!subscriptionSessionId) {
    return jsonResponse({ error: 'missing_subscription_session', message: 'Falta subscription_session_id o preapproval_id.' }, 400);
  }

  const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'subscription_config_error', message: 'La configuración no está disponible.' }, 500);
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/subscription-status?subscription_session_id=${encodeURIComponent(subscriptionSessionId)}`;
  const authorization = request.headers.get('Authorization');

  const headers: Record<string, string> = {
    apikey: supabaseAnonKey,
    'x-client-info': 'orvel-landing-server-subscription-status'
  };

  appendSupabaseAuthorizationHeader(headers, authorization, supabaseAnonKey);

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

    return jsonResponse(payload || { status: 'pending', materialized: false, account_materialized: false }, 200);
  } catch {
    return jsonResponse({ error: 'status_unavailable', message: 'Estado temporalmente no disponible.' }, 503);
  }
};
