import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

import {
  validateWaitlist,
  WAITLIST_PERSISTENCE_UNAVAILABLE
} from '../../lib/waitlist';
import { appendWaitlistToSheet } from '../../lib/waitlist-sheet';
import {
  isDisallowedOrigin,
  isPublicEndpointRateLimited
} from '../../lib/server/public-endpoint-guard';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const POST: APIRoute = async ({ request }) => {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      { error: 'invalid_json', message: 'El pedido no es válido.' },
      400
    );
  }

  const result = validateWaitlist(payload);
  if (!result.success) {
    return jsonResponse(
      {
        error: 'validation_error',
        fieldErrors: result.fieldErrors,
        message: 'Revisá los datos del formulario.'
      },
      400
    );
  }

  if (isDisallowedOrigin(request)) {
    return jsonResponse({ error: 'forbidden_origin', message: 'El pedido no es válido.' }, 403);
  }

  const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: 'waitlist_config_error', message: 'Todavía no podemos guardar tu lugar. Intentá de nuevo más tarde.' },
      500
    );
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let rateLimited = false;
  try {
    rateLimited = await isPublicEndpointRateLimited(supabaseAdmin, request, result.data.email);
  } catch {
    return jsonResponse(
      { error: 'waitlist_retry', message: 'Todavía no podemos guardar tu lugar. Intentá de nuevo más tarde.' },
      503
    );
  }
  if (rateLimited) {
    return jsonResponse({ status: 'ok', offer: null }, 200);
  }

  const persist = await appendWaitlistToSheet(result.data, {
    webhookUrl: process.env.WAITLIST_SHEETS_WEBHOOK_URL || import.meta.env.WAITLIST_SHEETS_WEBHOOK_URL,
    secret: process.env.WAITLIST_SHEETS_SECRET || import.meta.env.WAITLIST_SHEETS_SECRET
  });

  if (persist.ok) {
    return jsonResponse({ status: 'ok', offer: persist.offer }, 200);
  }

  if (persist.reason === 'already_exists') {
    return jsonResponse(
      {
        error: 'already_exists',
        message: 'Ya estás anotado en la lista de espera.',
        offer: persist.offer ?? null
      },
      409
    );
  }

  return jsonResponse(
    {
      error: WAITLIST_PERSISTENCE_UNAVAILABLE,
      message: 'Todavía no podemos guardar tu lugar. Intentá de nuevo más tarde.'
    },
    503
  );
};
