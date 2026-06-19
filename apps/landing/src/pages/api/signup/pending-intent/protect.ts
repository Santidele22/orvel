import type { APIRoute } from 'astro';

import { createPendingSignupHandoff } from '../../../../lib/server/pending-signup-handoff';

// createPendingSignupHandoff persists the server intent and internally protects PII with:
// protectPendingSignupPii({
//   first_name: body?.first_name,
//   last_name: body?.last_name,
//   business_name: body?.business_name,
//   phone: body?.phone,
// });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ERROR_MESSAGES: Record<string, string> = {
  EMAIL_ALREADY_REGISTERED: 'Este email ya tiene una cuenta en Orvel. Iniciá sesión para continuar.',
  PENDING_SIGNUP_ALREADY_EXISTS: 'Ya hay un alta paga pendiente para este email. Volvé al formulario si necesitás regenerar el intento.',
  pending_signup_required_fields: 'Faltan datos obligatorios para preparar el alta paga.',
  pending_signup_email_required: 'Necesitamos proteger tu email antes de iniciar el pago.',
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const serverIssuedHandoff = await createPendingSignupHandoff(request, {
      email: body?.email,
      first_name: body?.first_name,
      last_name: body?.last_name,
      phone: body?.phone,
      business_name: body?.business_name,
      business_type: body?.business_type,
      plan_code: body?.plan_code,
      billing_period: body?.billing_period,
    });

    return new Response(JSON.stringify({
      pending_signup_reference: serverIssuedHandoff.pendingSignupReference,
      serverIssuedRedirect: serverIssuedHandoff.redirectUrl,
      serverRedirectUrl: serverIssuedHandoff.redirectUrl,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': serverIssuedHandoff.setCookie,
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'pending_signup_protection_failed';
    const status = code === 'EMAIL_ALREADY_REGISTERED' || code === 'PENDING_SIGNUP_ALREADY_EXISTS' ? 409 : code === 'pending_signup_required_fields' ? 400 : 500;
    return jsonResponse({ error: code, message: ERROR_MESSAGES[code] || 'No pudimos proteger tus datos para iniciar el pago. Reintentá en unos segundos.' }, status);
  }
};
