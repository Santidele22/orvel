import type { APIRoute } from "astro";

import { appendSupabaseAuthorizationHeader } from "../../../lib/supabaseAuthorization";
import { resolvePendingSignupHandoff } from "../../../lib/server/pending-signup-handoff";

// Paid signup handoff is bound by the protect endpoint with Set-Cookie: HttpOnly; SameSite=Lax
// (Secure + __Host- on HTTPS). This API validates the opaque pending_signup_reference server-side.

const ALLOWED_PLANS = new Set(["PREMIUM"]);
const FALLBACK_PATH = "/billing/subscription";

type SubscriptionResult =
  | { ok: true; initPoint: string }
  | { ok: false; status: number; code: string; message: string };

const CONTRACT_VALIDATION_MESSAGES: Record<string, string> = {
  PLAN_MAPPING_REQUIRED: "Falta configurar la relación del plan seleccionado. Reintentá en unos minutos.",
  PLAN_MAPPING_INVALID: "El plan seleccionado no está correctamente configurado. Contactá soporte.",
  PLAN_IDENTIFIER_INVALID: "El identificador del plan no es válido para suscripción.",
  PENDING_SIGNUP_EMAIL_REQUIRED: "Necesitamos proteger tu email antes de iniciar el pago. Volvé al formulario y reintentá.",
  PENDING_SIGNUP_PII_INVALID: "No pudimos validar tus datos protegidos. Volvé al formulario y reintentá.",
  SIGNUP_UNAVAILABLE: "Si los datos son válidos, te enviaremos los próximos pasos por email.",
};

function normalizePlan(rawPlan: string | null): string | null {
  const normalized = rawPlan?.trim().toUpperCase();
  if (!normalized) return null;

  if (["STARTED", "BASIC", "STARTER", "MEDIUM", "GROWTH", "PRO", "SIMPLE", "CRECE", "ESCALA"].includes(normalized)) return "PREMIUM";
  return normalized;
}

function toFallbackUrl(requestUrl: URL, reason: string, plan: string | null): URL {
  const fallback = new URL(FALLBACK_PATH, requestUrl);
  if (plan) {
    fallback.searchParams.set("plan", plan);
  }
  fallback.searchParams.set("subscription_error", reason);
  fallback.searchParams.set("retry", "1");
  return fallback;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function normalizeBillingPeriod(_rawBilling: string | null | undefined): "monthly" {
  return "monthly";
}

function normalizeIdempotencyKey(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized) return normalized;
  }

  return null;
}

type PendingSignupIntent = {
  email_encrypted?: string;
  email_hmac?: string;
  first_name_encrypted?: string;
  first_name_hmac?: string;
  last_name_encrypted?: string;
  last_name_hmac?: string;
  phone_encrypted?: string;
  phone_hmac?: string;
  business_name_encrypted?: string;
  business_name_hmac?: string;
  pii_crypto_version?: string;
  plan_code?: string;
  billing_period?: string;
  business_type?: string;
  selected_business_types?: unknown;
  confirmation_status?: string;
  email_confirmed_at?: string;
};
type SubscriptionMode = "pending_signup_intent" | "existing_user";

function hasString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validatePendingSignupIntent(intent: PendingSignupIntent | null): SubscriptionResult | null {
  if (!intent) return null;

  if (intent.email_encrypted === undefined && intent.email_hmac === undefined) {
    return {
      ok: false,
      status: 400,
      code: "pending_signup_email_required",
      message: CONTRACT_VALIDATION_MESSAGES.PENDING_SIGNUP_EMAIL_REQUIRED,
    };
  }

  const protectedPairs: Array<[keyof PendingSignupIntent, keyof PendingSignupIntent]> = [
    ["email_encrypted", "email_hmac"],
    ["first_name_encrypted", "first_name_hmac"],
    ["last_name_encrypted", "last_name_hmac"],
    ["phone_encrypted", "phone_hmac"],
    ["business_name_encrypted", "business_name_hmac"],
  ];

  for (const [encryptedKey, hmacKey] of protectedPairs) {
    const encrypted = intent[encryptedKey];
    const hmac = intent[hmacKey];
    if ((encrypted !== undefined && !hasString(encrypted)) || (hmac !== undefined && !hasString(hmac)) || Boolean(encrypted) !== Boolean(hmac)) {
      return {
        ok: false,
        status: 400,
        code: "pending_signup_pii_invalid",
        message: CONTRACT_VALIDATION_MESSAGES.PENDING_SIGNUP_PII_INVALID,
      };
    }
  }

  return null;
}

async function startSubscription(request: Request, plan: string | null, idempotencyKey?: string | null, cardToken?: string | null, businessType?: string | null, billingPeriod?: string | null, browserPendingSignupIntent?: PendingSignupIntent | null, pendingSignupReference?: string | null): Promise<SubscriptionResult> {
  if (!plan || !ALLOWED_PLANS.has(plan)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_plan",
      message: "El plan seleccionado no está disponible.",
    };
  }

  const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      status: 500,
      code: "subscription_config_error",
      message: "La configuración de suscripción no está disponible.",
    };
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/create-subscription`;
  const authorization = request.headers.get("Authorization");
  const normalizedIdempotencyKey = normalizeIdempotencyKey(
    idempotencyKey,
    request.headers.get("Idempotency-Key"),
    request.headers.get("x-idempotency-key"),
  );
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: supabaseAnonKey,
    "x-client-info": "orvel-landing-server-subscription-start",
  };

  appendSupabaseAuthorizationHeader(headers, authorization, supabaseAnonKey);
  if (normalizedIdempotencyKey) {
    headers["X-Idempotency-Key"] = normalizedIdempotencyKey;
  }

  try {
    const effectiveBusinessType = businessType || null;
    const resolvedPendingSignup = pendingSignupReference
      ? await resolvePendingSignupHandoff(request, pendingSignupReference)
      : null;
    if (pendingSignupReference && !resolvedPendingSignup) {
      return {
        ok: false,
        status: 400,
        code: "pending_signup_missing",
        message: "No encontramos los datos protegidos de tu alta paga. Volvé al formulario para recuperar el intento y reintentá el pago.",
      };
    }
    const pendingSignupIntent = (resolvedPendingSignup?.pendingSignupIntent as PendingSignupIntent | undefined) || browserPendingSignupIntent || null;
    const pendingSignupValidation = validatePendingSignupIntent(pendingSignupIntent);
    if (pendingSignupValidation) return pendingSignupValidation;
    if (pendingSignupReference && (!pendingSignupIntent?.email_confirmed_at || pendingSignupIntent.confirmation_status !== "confirmed")) {
      return {
        ok: false,
        status: 409,
        code: "email_confirmation_required",
        message: "Confirmá tu email antes de iniciar el pago.",
      };
    }
    const mode: SubscriptionMode = pendingSignupIntent ? "pending_signup_intent" : "existing_user";
    const upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ 
        plan_code: plan, 
        plan_identifier: plan,
        cadence: normalizeBillingPeriod(billingPeriod),
        billing_period: normalizeBillingPeriod(billingPeriod),
        business_type: effectiveBusinessType,
        mode,
        pending_signup_intent: pendingSignupIntent ? {
            email_encrypted: pendingSignupIntent.email_encrypted,
            email_hmac: pendingSignupIntent.email_hmac,
            first_name_encrypted: pendingSignupIntent.first_name_encrypted,
            first_name_hmac: pendingSignupIntent.first_name_hmac,
            last_name_encrypted: pendingSignupIntent.last_name_encrypted,
            last_name_hmac: pendingSignupIntent.last_name_hmac,
            phone_encrypted: pendingSignupIntent.phone_encrypted,
            phone_hmac: pendingSignupIntent.phone_hmac,
            business_name_encrypted: pendingSignupIntent.business_name_encrypted,
            business_name_hmac: pendingSignupIntent.business_name_hmac,
            pii_crypto_version: pendingSignupIntent.pii_crypto_version,
            plan_code: pendingSignupIntent.plan_code,
            billing_period: pendingSignupIntent.billing_period,
            business_type: pendingSignupIntent.business_type,
            selected_business_types: pendingSignupIntent.selected_business_types,
        } : undefined,
        pending_signup_reference: resolvedPendingSignup?.pendingSignupReference,
      }),
    });

    if (!upstreamResponse.ok) {
      let code = "subscription_failed";
      let message = "No pudimos iniciar el pago. Reintentá en unos segundos.";

      try {
        const errorData = await upstreamResponse.json();
        if (typeof errorData?.error === "string" && errorData.error) {
          code = errorData.error;
        }
        if (typeof errorData?.code === "string" && errorData.code) {
          code = errorData.code;
        }
        if (typeof errorData?.message === "string" && errorData.message) {
          message = errorData.message;
        }
        if (CONTRACT_VALIDATION_MESSAGES[code]) {
          message = CONTRACT_VALIDATION_MESSAGES[code];
        }
      } catch {
        // Keep the controlled generic error if the upstream body is not JSON.
      }

      return { ok: false, status: upstreamResponse.status, code, message };
    }

    const data = await upstreamResponse.json();
    const initPoint = data?.init_point;

    if (typeof initPoint !== "string" || !initPoint) {
      return {
        ok: false,
        status: 502,
        code: "subscription_error",
        message: "Mercado Pago no devolvió una URL de pago válida.",
      };
    }

    return { ok: true, initPoint };
  } catch {
    return {
      ok: false,
      status: 503,
      code: "subscription_retry",
      message: "No pudimos conectar con suscripciones. Reintentá en unos segundos.",
    };
  }
}

function fallbackReason(code: string, mode: SubscriptionMode = "existing_user"): string {
  if (code === "BUSINESS_REQUIRED") {
    return mode === "pending_signup_intent" ? "pending_signup_intent_business_required" : "business_required";
  }
  if (code === "EMAIL_REQUIRED") return "email_required";
  return code.toLowerCase();
}

export const GET: APIRoute = async ({ request, redirect }) => {
  const requestUrl = new URL(request.url);
  const plan = normalizePlan(requestUrl.searchParams.get("plan"));
  const idempotencyKey = normalizeIdempotencyKey(
    requestUrl.searchParams.get("idempotency_key"),
    request.headers.get("Idempotency-Key"),
    request.headers.get("x-idempotency-key"),
  );
  const result = await startSubscription(request, plan, idempotencyKey);

  if (result.ok) {
    return redirect(result.initPoint, 303);
  }

  return redirect(toFallbackUrl(requestUrl, fallbackReason(result.code), plan).toString(), 303);
};

export const POST: APIRoute = async ({ request }) => {
  let rawPlan: string | null = null;
  let idempotencyKey: string | null = null;

  try {
    const body = await request.json();
    rawPlan = typeof body?.plan === "string" ? body.plan : null;
    idempotencyKey = normalizeIdempotencyKey(
      typeof body?.idempotencyKey === "string" ? body.idempotencyKey : null,
      request.headers.get("Idempotency-Key"),
      request.headers.get("x-idempotency-key"),
    );
    const businessType = typeof body?.businessType === "string" ? body.businessType.trim() : null;
    const pendingSignupIntent = body?.pending_signup_intent && typeof body.pending_signup_intent === "object"
      ? body.pending_signup_intent as PendingSignupIntent
      : null;
    const pendingSignupReference = typeof body?.pending_signup_reference === "string" ? body.pending_signup_reference.trim()
      : typeof body?.pending_signup_token === "string" ? body.pending_signup_token.trim()
        : typeof body?.intent_reference === "string" ? body.intent_reference.trim()
          : typeof body?.intent_token === "string" ? body.intent_token.trim()
            : null;
    const billingPeriod = typeof body?.billing === "string" ? body.billing.trim()
      : typeof body?.billing_period === "string" ? body.billing_period.trim()
        : typeof body?.cadence === "string" ? body.cadence.trim()
          : null;
    const result = await startSubscription(request, normalizePlan(rawPlan), idempotencyKey, null, businessType, billingPeriod, pendingSignupIntent, pendingSignupReference);

    if (result.ok) {
      return jsonResponse({ init_point: result.initPoint });
    }

    return jsonResponse({ error: result.code, message: result.message }, result.status);
  } catch {
    return jsonResponse(
      { error: "invalid_json", message: "El pedido de suscripción no tiene un JSON válido." },
      400,
    );
  }
};
