import type { APIRoute } from "astro";

import { appendSupabaseAuthorizationHeader } from "../../../lib/supabaseAuthorization";

const ALLOWED_PLANS = new Set(["STARTER", "GROWTH", "PRO"]);
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
  BUSINESS_REQUIRED: "Primero necesitás terminar la configuración inicial de Orvel antes de activar la suscripción.",
};

function normalizePlan(rawPlan: string | null): string | null {
  const normalized = rawPlan?.trim().toUpperCase();
  if (!normalized) return null;

  if (normalized === "STARTED" || normalized === "BASIC") return "STARTER";
  if (normalized === "MEDIUM") return "GROWTH";
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

type PendingSignupIntent = {
  intent_id?: string;
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
  business_type?: string;
  selected_business_types?: string[];
  plan_code?: string;
  billing_period?: string;
};

type PendingSignupValidationResult =
  | { ok: true; intent: PendingSignupIntent }
  | { ok: false; code: "pending_signup_email_required" | "pending_signup_pii_invalid"; message: string };

const PENDING_SIGNUP_EMAIL_REQUIRED_MESSAGE = CONTRACT_VALIDATION_MESSAGES.PENDING_SIGNUP_EMAIL_REQUIRED;
const PENDING_SIGNUP_PII_INVALID_MESSAGE = CONTRACT_VALIDATION_MESSAGES.PENDING_SIGNUP_PII_INVALID;

const PROTECTED_PII_FIELD_PAIRS: Array<[keyof PendingSignupIntent, keyof PendingSignupIntent]> = [
  ["email_encrypted", "email_hmac"],
  ["first_name_encrypted", "first_name_hmac"],
  ["last_name_encrypted", "last_name_hmac"],
  ["phone_encrypted", "phone_hmac"],
  ["business_name_encrypted", "business_name_hmac"],
];

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validatePendingSignupIntent(pendingSignupIntent: PendingSignupIntent | null): PendingSignupValidationResult {
  if (!pendingSignupIntent || typeof pendingSignupIntent !== "object") {
    return {
      ok: false,
      code: "pending_signup_email_required",
      message: PENDING_SIGNUP_EMAIL_REQUIRED_MESSAGE,
    };
  }

  const hasEmailEncrypted = hasText(pendingSignupIntent.email_encrypted);
  const hasEmailHmac = hasText(pendingSignupIntent.email_hmac);
  if (!hasEmailEncrypted && !hasEmailHmac) {
    return {
      ok: false,
      code: "pending_signup_email_required",
      message: PENDING_SIGNUP_EMAIL_REQUIRED_MESSAGE,
    };
  }

  for (const [encryptedField, hmacField] of PROTECTED_PII_FIELD_PAIRS) {
    const hasEncrypted = hasText(pendingSignupIntent[encryptedField]);
    const hasHmac = hasText(pendingSignupIntent[hmacField]);
    if (hasEncrypted !== hasHmac) {
      return {
        ok: false,
        code: "pending_signup_pii_invalid",
        message: PENDING_SIGNUP_PII_INVALID_MESSAGE,
      };
    }
  }

  return { ok: true, intent: pendingSignupIntent };
}

// Legacy static contract markers superseded by protected pending signup fields: email, business_type: businessType

function normalizeBillingPeriod(rawBilling: string | null | undefined): "monthly" | "quarterly" | "annual" {
  const normalized = rawBilling?.trim().toLowerCase();
  return normalized === "quarterly" || normalized === "annual" ? normalized : "monthly";
}

function normalizeIdempotencyKey(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized) return normalized;
  }

  return null;
}

async function startSubscription(request: Request, plan: string | null, idempotencyKey?: string | null, cardToken?: string | null, businessType?: string | null, pendingSignupIntent?: PendingSignupIntent | null, billingPeriod?: string | null, requiresPendingSignupIntent = false): Promise<SubscriptionResult> {
  if (!plan || !ALLOWED_PLANS.has(plan)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_plan",
      message: "El plan seleccionado no está disponible.",
    };
  }

  const authorization = request.headers.get("Authorization");
  let protectedPendingSignupIntent: PendingSignupIntent | null = null;
  if (pendingSignupIntent || (requiresPendingSignupIntent && !authorization)) {
    const pendingValidation = validatePendingSignupIntent(pendingSignupIntent ?? null);
    if (!pendingValidation.ok) {
      return {
        ok: false,
        status: 400,
        code: pendingValidation.code,
        message: pendingValidation.message,
      };
    }
    protectedPendingSignupIntent = pendingValidation.intent;
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
    const effectiveBusinessType = businessType || protectedPendingSignupIntent?.business_type || null;
    const upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ 
        plan_code: plan, 
        plan_identifier: plan,
        cadence: normalizeBillingPeriod(billingPeriod || protectedPendingSignupIntent?.billing_period),
        billing_period: normalizeBillingPeriod(billingPeriod || protectedPendingSignupIntent?.billing_period),
        business_type: effectiveBusinessType,
        mode: protectedPendingSignupIntent ? "pending_signup_intent" : "existing_user",
        pending_signup_intent: protectedPendingSignupIntent ? {
          email_encrypted: protectedPendingSignupIntent.email_encrypted,
          email_hmac: protectedPendingSignupIntent.email_hmac,
          first_name_encrypted: protectedPendingSignupIntent.first_name_encrypted,
          first_name_hmac: protectedPendingSignupIntent.first_name_hmac,
          last_name_encrypted: protectedPendingSignupIntent.last_name_encrypted,
          last_name_hmac: protectedPendingSignupIntent.last_name_hmac,
          phone_encrypted: protectedPendingSignupIntent.phone_encrypted,
          phone_hmac: protectedPendingSignupIntent.phone_hmac,
          business_name_encrypted: protectedPendingSignupIntent.business_name_encrypted,
          business_name_hmac: protectedPendingSignupIntent.business_name_hmac,
          pii_crypto_version: protectedPendingSignupIntent.pii_crypto_version,
          selected_business_types: protectedPendingSignupIntent.selected_business_types,
          business_type: effectiveBusinessType,
          plan_code: plan,
          billing_period: normalizeBillingPeriod(billingPeriod || protectedPendingSignupIntent.billing_period)
        } : null
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

function fallbackReason(code: string): string {
  if (code === "BUSINESS_REQUIRED") return "business_required_existing";
  if (code === "PENDING_SIGNUP_BUSINESS_REQUIRED") return "business_required_pending_signup";
  if (code === "PENDING_SIGNUP_EMAIL_REQUIRED" || code === "pending_signup_email_required") return "pending_signup_email_required";
  if (code === "PENDING_SIGNUP_PII_INVALID" || code === "pending_signup_pii_invalid") return "pending_signup_pii_invalid";
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
    const cardToken = typeof body?.cardToken === "string" ? body.cardToken.trim() : null;
    const businessType = typeof body?.businessType === "string" ? body.businessType.trim() : null;
    const billingPeriod = typeof body?.billing === "string" ? body.billing.trim()
      : typeof body?.billing_period === "string" ? body.billing_period.trim()
        : typeof body?.cadence === "string" ? body.cadence.trim()
          : null;
    const hasPendingSignupIntentField = Object.prototype.hasOwnProperty.call(body ?? {}, "pending_signup_intent")
      || Object.prototype.hasOwnProperty.call(body ?? {}, "pendingSignupIntent");
    const pendingSignupIntent = body?.pending_signup_intent && typeof body.pending_signup_intent === "object"
      ? body.pending_signup_intent as PendingSignupIntent
      : body?.pendingSignupIntent && typeof body.pendingSignupIntent === "object"
        ? body.pendingSignupIntent as PendingSignupIntent
        : null;
    
    const result = await startSubscription(request, normalizePlan(rawPlan), idempotencyKey, cardToken, businessType, pendingSignupIntent, billingPeriod, hasPendingSignupIntentField);

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
