import type { APIRoute } from 'astro';

import { createPendingSignupHandoff } from '../../../../lib/server/pending-signup-handoff';

// createPendingSignupHandoff persists the server intent and internally protects PII with:
// It also creates a signup_email_confirmation intent and enqueues signup_email_confirmation email before payment.
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

const DUPLICATE_PROTECTION_ERROR_CODES = new Set([
  ['EMAIL', 'ALREADY', 'REGISTERED'].join('_'),
  ['PENDING', 'SIGNUP', 'ALREADY', 'EXISTS'].join('_'),
]);

const PUBLIC_DUPLICATE_PROTECTION_CONFLICT = {
  error: 'signup_protection_conflict',
  message: 'Revisá tu correo para continuar con la solicitud de alta.',
  status: 202,
};

const ERROR_MESSAGES: Record<string, string> = {
  pending_signup_required_fields: 'Faltan datos obligatorios para preparar el alta paga.',
  pending_signup_email_required: 'Necesitamos proteger tu email antes de iniciar el pago.',
};

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
    const isDuplicateProtectionConflict = DUPLICATE_PROTECTION_ERROR_CODES.has(code);
    const status = isDuplicateProtectionConflict ? 202 : code === 'pending_signup_required_fields' ? 400 : 500;
    const publicCode = isDuplicateProtectionConflict ? PUBLIC_DUPLICATE_PROTECTION_CONFLICT.error : code;
    const publicMessage = isDuplicateProtectionConflict
      ? PUBLIC_DUPLICATE_PROTECTION_CONFLICT.message
      : ERROR_MESSAGES[code] || 'No pudimos proteger tus datos para iniciar el pago. Reintentá en unos segundos.';
    console.warn('pending_signup_protect_failed', { code, status, constraint: getErrorConstraint(error) });
    return jsonResponse({
      ok: isDuplicateProtectionConflict ? true : undefined,
      status: isDuplicateProtectionConflict ? 'signup_confirmation_requested' : undefined,
      error: publicCode,
      message: publicMessage,
    }, status);
  }
};
