import type { APIRoute } from 'astro';

import { createSupabaseSignupAdapter } from '../../../../lib/supabase-auth-adapter';
import { unprotectPendingSignupPii } from '../../../../lib/server/pending-signup-pii-protection';

const FREE_SIGNUP_PLAN = 'FREE';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function normalizeRequestedPlanCode(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized;
}

function normalizeBusinessType(value: unknown): string {
  if (typeof value !== 'string') return 'otro';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'unas') return 'uñas';
  if (normalized === 'pestanas') return 'pestañas';
  return normalized || 'otro';
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const pendingSignupIntent = body?.pending_signup_intent;
    if (!pendingSignupIntent || typeof pendingSignupIntent !== 'object') {
      return jsonResponse({ ok: false, error: 'pending_signup_intent_required' }, 400);
    }

    const password = typeof body?.password === 'string' ? body.password : '';
    if (password.length < 8) {
      return jsonResponse({ ok: false, error: 'signup_password_invalid' }, 400);
    }

    if (normalizeRequestedPlanCode(body?.plan_code) !== FREE_SIGNUP_PLAN) {
      return jsonResponse({ ok: false, error: 'pending_signup_finalize_free_plan_only' }, 400);
    }

    const pii = await unprotectPendingSignupPii(pendingSignupIntent as Record<string, unknown>);
    const signup = createSupabaseSignupAdapter({
      SUPABASE_URL: import.meta.env.PUBLIC_SUPABASE_URL,
      SUPABASE_ANON_KEY: import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    });
    const result = await signup({
      nombre: pii.first_name,
      apellido: pii.last_name,
      negocioNombre: pii.business_name,
      tipoNegocio: normalizeBusinessType(body?.business_type),
      telefono: pii.phone,
      email: pii.email,
      password,
      plan: FREE_SIGNUP_PLAN,
      returnTo: typeof body?.return_to === 'string' ? body.return_to : '/auth/login',
    });

    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error, code: result.code, redirectTo: result.redirectTo }, 400);
    }

    return jsonResponse({ ok: true, email: result.user.email });
  } catch {
    return jsonResponse({ ok: false, error: 'pending_signup_finalize_failed' }, 500);
  }
};
