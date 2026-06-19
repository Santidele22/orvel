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
  PENDING_SIGNUP_ALREADY_EXISTS: 'Ya hay un alta paga pendiente para este email. Podés continuar con el pago pendiente o reiniciar el alta en unos minutos.',
  pending_signup_required_fields: 'Faltan datos obligatorios para preparar el alta paga.',
  pending_signup_email_required: 'Necesitamos proteger tu email antes de iniciar el pago.',
};

const RECOVERABLE_ERRORS = new Set(['PENDING_SIGNUP_ALREADY_EXISTS']);

function getErrorCode(error: unknown): string {
  return error instanceof Error ? error.message : 'pending_signup_protection_failed';
}

function getErrorConstraint(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint.slice(0, 120) : undefined;
}

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
    const code = getErrorCode(error);
    const status = code === 'EMAIL_ALREADY_REGISTERED' || code === 'PENDING_SIGNUP_ALREADY_EXISTS' ? 409 : code === 'pending_signup_required_fields' ? 400 : 500;
    console.warn('pending_signup_protect_failed', { code, status, constraint: getErrorConstraint(error) });
    return jsonResponse({
      error: code,
      message: ERROR_MESSAGES[code] || 'No pudimos proteger tus datos para iniciar el pago. Reintentá en unos segundos.',
      recoverable: RECOVERABLE_ERRORS.has(code),
      recovery_action: code === 'PENDING_SIGNUP_ALREADY_EXISTS' ? 'restart_or_retry_existing_pending_signup' : undefined,
    }, status);
  }
};
