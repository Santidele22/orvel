import type { APIRoute } from "astro";

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

type PendingSignupIntent = {
  email?: string;
  nombre?: string;
  apellido?: string;
  negocioNombre?: string;
  telefono?: string;
  business_type?: string;
  selected_business_types?: string[];
  plan_code?: string;
  billing_period?: string;
};

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

async function startSubscription(request: Request, plan: string | null, idempotencyKey?: string | null, cardToken?: string | null, email?: string | null, businessType?: string | null, nombre?: string | null, apellido?: string | null, telefono?: string | null, pendingSignupIntent?: PendingSignupIntent | null, billingPeriod?: string | null): Promise<SubscriptionResult> {
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

  if (authorization) {
    headers.Authorization = authorization;
  }
  if (normalizedIdempotencyKey) {
    headers["X-Idempotency-Key"] = normalizedIdempotencyKey;
  }

  try {
    const upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ 
        plan_code: plan, 
        plan_identifier: plan,
        email,
        cadence: normalizeBillingPeriod(billingPeriod || pendingSignupIntent?.billing_period),
        billing_period: normalizeBillingPeriod(billingPeriod || pendingSignupIntent?.billing_period),
        business_type: businessType,
        nombre,
        apellido,
        telefono,
        mode: pendingSignupIntent ? "pending_signup_intent" : "existing_user",
        pending_signup_intent: pendingSignupIntent ? {
          ...pendingSignupIntent,
          email,
          business_type: businessType,
          plan_code: plan,
          billing_period: normalizeBillingPeriod(billingPeriod || pendingSignupIntent.billing_period)
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
    const email = typeof body?.email === "string" ? body.email.trim() : null;
    const businessType = typeof body?.businessType === "string" ? body.businessType.trim() : null;
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : null;
    const apellido = typeof body?.apellido === "string" ? body.apellido.trim() : null;
    const telefono = typeof body?.telefono === "string" ? body.telefono.trim() : null;
    const billingPeriod = typeof body?.billing === "string" ? body.billing.trim()
      : typeof body?.billing_period === "string" ? body.billing_period.trim()
        : typeof body?.cadence === "string" ? body.cadence.trim()
          : null;
    const pendingSignupIntent = body?.pending_signup_intent && typeof body.pending_signup_intent === "object"
      ? body.pending_signup_intent as PendingSignupIntent
      : body?.pendingSignupIntent && typeof body.pendingSignupIntent === "object"
        ? body.pendingSignupIntent as PendingSignupIntent
        : null;
    
    const result = await startSubscription(request, normalizePlan(rawPlan), idempotencyKey, cardToken, email, businessType, nombre, apellido, telefono, pendingSignupIntent, billingPeriod);

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
