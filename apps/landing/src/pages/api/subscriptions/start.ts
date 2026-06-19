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

type AccountFirstSession = {
  account_first_intent_id: string;
  account_first_session: string;
};

type SubscriptionMode = "account_first_signup" | "existing_user";

async function startSubscription(request: Request, plan: string | null, idempotencyKey?: string | null, cardToken?: string | null, businessType?: string | null, billingPeriod?: string | null, accountFirstSession?: AccountFirstSession | null): Promise<SubscriptionResult> {
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
    const mode = accountFirstSession ? "account_first_signup" : "existing_user";
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
        ...(accountFirstSession ? {
          account_first_intent_id: accountFirstSession.account_first_intent_id,
          account_first_session: accountFirstSession.account_first_session,
        } : {}),
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
        if (code === "BUSINESS_REQUIRED" && mode === "account_first_signup") {
          code = "ACCOUNT_FIRST_BUSINESS_REQUIRED";
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
    return mode === "account_first_signup"
      ? "business_required_account_first_signup"
      : "business_required_existing";
  }
  if (code === "ACCOUNT_FIRST_BUSINESS_REQUIRED") return "business_required_account_first_signup";
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
    const accountFirst = body?.account_first && typeof body.account_first === "object"
      ? body.account_first as Record<string, unknown>
      : null;
    const billingPeriod = typeof body?.billing === "string" ? body.billing.trim()
      : typeof body?.billing_period === "string" ? body.billing_period.trim()
        : typeof body?.cadence === "string" ? body.cadence.trim()
          : null;
    const accountFirstIntentId = typeof accountFirst?.account_first_intent_id === "string"
      ? accountFirst.account_first_intent_id.trim()
      : null;
    const accountFirstSession = typeof accountFirst?.account_first_session === "string"
      ? accountFirst.account_first_session.trim()
      : null;
    const result = await startSubscription(request, normalizePlan(rawPlan), idempotencyKey, null, businessType, billingPeriod, accountFirstIntentId && accountFirstSession ? {
      account_first_intent_id: accountFirstIntentId,
      account_first_session: accountFirstSession,
    } : null);

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
