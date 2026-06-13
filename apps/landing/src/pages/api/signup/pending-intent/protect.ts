import type { APIRoute } from 'astro';

import { protectPendingSignupPii } from '../../../../lib/server/pending-signup-pii-protection';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const protectedFields = await protectPendingSignupPii({
      email: body?.email,
      first_name: body?.first_name,
      last_name: body?.last_name,
      phone: body?.phone,
      business_name: body?.business_name,
    });

    if (!protectedFields.email_encrypted || !protectedFields.email_hmac) {
      return jsonResponse({ error: 'pending_signup_email_required' }, 400);
    }

    return jsonResponse({ protected_pending_signup_intent: protectedFields });
  } catch {
    return jsonResponse({ error: 'pending_signup_protection_failed' }, 500);
  }
};
