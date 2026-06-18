// create-subscription Edge Function
// Creates a Mercado Pago preapproval subscription
// Endpoint: POST /functions/v1/create-subscription

import { createClient } from "@supabase/supabase-js";
import {
  getBillingCorsHeaders,
  rejectDisallowedBrowserOrigin,
  requireServerSecret,
} from "../_shared/billing-security.ts";
import { normalizeCanonicalPlanCode } from "../_shared/canonical-plan-codes.ts";
import {
  normalizeCadence,
  normalizeTier,
  resolvePlanCatalogRow,
} from "../_shared/mp-plan-catalog.ts";
import { evaluatePreapprovalPlanRollout } from "../_shared/mp-rollout-control.ts";
import { recordPreapprovalCreateMetric } from "../_shared/mp-rollout-observability.ts";
import { createSubscriptionSessionReference } from "../_shared/mp-subscription-session-reference.ts";
import { buildAppUrl } from "../_shared/orvel-url.ts";
import {
  getBearerToken,
  shouldValidateCreateSubscriptionAuthorization,
} from "../_shared/create-subscription-auth.ts";
import { verifyPendingSignupPiiField } from "../_shared/pending-signup-pii.ts";

const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitStore = new Map<string, number[]>();

function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("client-ip") ||
    "unknown"
  );
}

function isRateLimited(req: Request): boolean {
  const now = Date.now();
  const ip = getClientIp(req);
  const recent = (rateLimitStore.get(ip) || []).filter((ts) =>
    now - ts < RATE_LIMIT_WINDOW_MS
  );

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitStore.set(ip, recent);
    return true;
  }

  recent.push(now);
  rateLimitStore.set(ip, recent);
  return false;
}

// Mercado Pago API URLs
const MP_API_BASE = "https://api.mercadopago.com";

interface Plan {
  id: string;
  code: string;
  name: string;
  price: number;
  currency: string;
  billing_frequency: number;
  billing_frequency_type: string;
  price_quarterly?: number | null;
  price_annual?: number | null;
}

interface SubscriptionRequest {
  plan_code: string;
  tier?: string;
  cadence?: string;
  preapproval_plan_id?: string;
  card_token_id?: string;
  billing_period?: string;
  mode?: string;
  account_first_intent?: {
    email_encrypted?: string;
    email_hmac?: string;
    first_name_encrypted?: string;
    first_name_hmac?: string;
    last_name_encrypted?: string;
    last_name_hmac?: string;
    business_name_encrypted?: string;
    business_name_hmac?: string;
    phone_encrypted?: string;
    phone_hmac?: string;
    pii_crypto_version?: string;
    business_type?: string;
    selected_business_types?: string[];
    plan_code?: string;
    billing_period?: string;
  } | null;
  pending_signup_intent?: {
    email_encrypted?: string;
    email_hmac?: string;
    first_name_encrypted?: string;
    first_name_hmac?: string;
    last_name_encrypted?: string;
    last_name_hmac?: string;
    business_name_encrypted?: string;
    business_name_hmac?: string;
    phone_encrypted?: string;
    phone_hmac?: string;
    pii_crypto_version?: string;
    business_type?: string;
    selected_business_types?: string[];
    plan_code?: string;
    billing_period?: string;
  } | null;
  business_type?: string;
}

function sanitizeDiagnosticText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.replace(/[\r\n\t]+/g, " ").trim();
  if (!trimmed) return undefined;

  return trimmed.slice(0, 240);
}

function sanitizeMercadoPagoError(errorText: string, status: number): {
  provider: "mercado_pago";
  status: number;
  code?: string;
  message?: string;
} {
  const fallback = {
    provider: "mercado_pago" as const,
    status,
    message: sanitizeDiagnosticText(errorText) ||
      "Mercado Pago rejected the preapproval request",
  };

  try {
    const parsed = JSON.parse(errorText) as Record<string, unknown>;
    const cause = Array.isArray(parsed.cause)
      ? parsed.cause[0] as Record<string, unknown> | undefined
      : undefined;

    return {
      provider: "mercado_pago",
      status,
      code: sanitizeDiagnosticText(parsed.error) ||
        sanitizeDiagnosticText(parsed.status) ||
        sanitizeDiagnosticText(cause?.code),
      message: sanitizeDiagnosticText(parsed.message) ||
        sanitizeDiagnosticText(cause?.description) ||
        sanitizeDiagnosticText(cause?.message) ||
        fallback.message,
    };
  } catch {
    return fallback;
  }
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function createOpaqueSubscriptionSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sanitizeIntentText(value: unknown, maxLength = 160): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/[\r\n\t]+/g, " ").trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeBillingCadence(
  value: unknown,
): "monthly" | "quarterly" | "annual" {
  if (typeof value !== "string") return "monthly";
  const normalized = value.trim().toLowerCase();
  return normalized === "quarterly" || normalized === "annual"
    ? normalized
    : "monthly";
}

async function verifyOptionalProtectedAccountFirstField(
  field: string,
  encryptedValue: unknown,
  hmacValue: unknown,
): Promise<void> {
  const hasEncrypted = typeof encryptedValue === "string" &&
    encryptedValue.trim().length > 0;
  const hasHmac = typeof hmacValue === "string" && hmacValue.trim().length > 0;
  if (!hasEncrypted && !hasHmac) return;
  if (!hasEncrypted || !hasHmac) {
    throw new Error("account_first_pii_pair_incomplete");
  }
  await verifyPendingSignupPiiField(field, encryptedValue, hmacValue);
}

function planPriceForCadence(
  plan: Plan,
  cadence: "monthly" | "quarterly" | "annual",
): number {
  if (cadence === "quarterly" && Number(plan.price_quarterly) > 0) {
    return Number(plan.price_quarterly);
  }
  if (cadence === "annual" && Number(plan.price_annual) > 0) {
    return Number(plan.price_annual);
  }
  return Number(plan.price);
}

function planFrequencyForCadence(
  plan: Plan,
  cadence: "monthly" | "quarterly" | "annual",
): { frequency: number; frequencyType: string } {
  if (cadence === "quarterly") return { frequency: 3, frequencyType: "months" };
  if (cadence === "annual") return { frequency: 12, frequencyType: "months" };
  return {
    frequency: plan.billing_frequency || 1,
    frequencyType: plan.billing_frequency_type || "months",
  };
}

function getCanonicalIdempotencyKey(headers: Headers): string | null {
  return headers.get("Idempotency-Key")?.trim() ||
    headers.get("x-idempotency-key")?.trim() ||
    null;
}

Deno.serve(async (req) => {
  const corsHeaders = getBillingCorsHeaders(req);
  const requestStartedAt = Date.now();
  const correlationId = req.headers.get("x-correlation-id") ||
    req.headers.get("x-request-id") || crypto.randomUUID();
  const idempotencyKey = getCanonicalIdempotencyKey(req.headers);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const disallowedOrigin = rejectDisallowedBrowserOrigin(req);
  if (disallowedOrigin) return disallowedOrigin;

  if (isRateLimited(req)) {
    return new Response(
      JSON.stringify({
        error: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests",
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      },
    );
  }

  try {
    // =============================================================================
    // 1. PARSE AND VALIDATE REQUEST SHAPE
    // =============================================================================
    let body: SubscriptionRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          error: "INVALID_JSON",
          message: "Cuerpo de solicitud inválido",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // =============================================================================
    // 2. VERIFY USER AUTHENTICATION (Optional for anonymous account-first)
    // =============================================================================
    const authHeader = req.headers.get("Authorization");
    let user = null;
    let business = null;

    // Create Supabase client with admin privileges to bypass RLS
    const supabaseAdmin = createClient(
      requireServerSecret("SUPABASE_URL"),
      requireServerSecret("SUPABASE_SERVICE_ROLE_KEY"),
    );

    if (
      shouldValidateCreateSubscriptionAuthorization({
        authHeader,
        requestBody: body,
        supabaseAnonKey: Deno.env.get("SUPABASE_ANON_KEY"),
      })
    ) {
      const token = getBearerToken(authHeader || "");

      // Verify JWT and get user
      const { data: { user: authUser }, error: authError } = await supabaseAdmin
        .auth.getUser(token);
      if (authError || !authUser) {
        return new Response(
          JSON.stringify({
            error: "INVALID_TOKEN",
            message: "Token inválido o expirado",
          }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      user = authUser;

      // =============================================================================
      // 2. GET USER'S BUSINESS
      // =============================================================================
      const { data: businessData, error: businessError } = await supabaseAdmin
        .from("businesses")
        .select("id, name, owner_id")
        .eq("owner_id", user.id)
        .single();

      if (!businessError && businessData) {
        business = businessData;
      } else if (user) {
        // Auto-create basic business if user exists but has no business yet
        const slug = `mi-negocio-${Date.now()}`;
        const { data: newBusiness, error: createBusinessError } =
          await supabaseAdmin
            .from("businesses")
            .insert({
              name: "Mi Negocio",
              slug: slug,
              owner_id: user.id,
              timezone: "America/Argentina/Buenos_Aires",
              is_active: true,
            })
            .select("id, name, owner_id")
            .single();

        if (!createBusinessError && newBusiness) {
          business = newBusiness;
          console.log("Auto-created business for user:", user.id);
        }
      }
    }

    // =============================================================================
    // 3. PARSE AND VALIDATE REQUEST
    // =============================================================================
    const { plan_code, tier } = body;
    const accountFirstIntent =
      body.mode === "account_first_intent" || body.account_first_intent
        ? body.account_first_intent || {}
        : null;
    const pendingSignupIntent =
      body.mode === "pending_signup_intent" || body.pending_signup_intent
        ? body.pending_signup_intent || {}
        : null;
    const requestedCadence = normalizeBillingCadence(
      body.cadence || body.billing_period ||
        accountFirstIntent?.billing_period ||
        pendingSignupIntent?.billing_period,
    );
    const accountFirstBusinessType = sanitizeIntentText(
      accountFirstIntent?.business_type || pendingSignupIntent?.business_type ||
        body.business_type,
      80,
    );
    const isAccountFirstIntent = !business && !!accountFirstIntent;
    const isPendingSignupIntent = !business && !!pendingSignupIntent;

    let effectivePlanCode: string | null = typeof plan_code === "string"
      ? plan_code
      : null;
    let catalogRow: {
      id: string;
      tier: string;
      cadence: string;
      tier_code: string;
      preapproval_plan_id: string;
      amount?: number;
      currency?: string;
      frequency?: number;
      frequency_type?: string;
    } | null = null;

    if (
      (!effectivePlanCode || effectivePlanCode.trim().length === 0) &&
      typeof tier === "string"
    ) {
      const normalizedTier = normalizeTier(tier);
      const normalizedCadence = normalizeCadence(
        typeof body.cadence === "string" ? body.cadence : requestedCadence,
      );

      if (!normalizedTier || !normalizedCadence) {
        return new Response(
          JSON.stringify({
            error: "INVALID_TIER_OR_CADENCE",
            message: "tier/cadence inválidos",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { data: catalogRows, error: catalogError } = await supabaseAdmin
        .from("mp_plan_catalog")
        .select(
          "id, tier, cadence, tier_code, preapproval_plan_id, amount, currency, frequency, frequency_type",
        )
        .eq("tier", normalizedTier)
        .eq("cadence", normalizedCadence)
        .limit(1);

      if (catalogError) {
        return new Response(
          JSON.stringify({
            error: "PLAN_CATALOG_READ_FAILED",
            message: "No se pudo leer mp_plan_catalog",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const resolved = resolvePlanCatalogRow(
        catalogRows ?? [],
        normalizedTier,
        normalizedCadence,
      );
      if (!resolved || !resolved.preapproval_plan_id) {
        return new Response(
          JSON.stringify({
            error: "PREAPPROVAL_PLAN_NOT_SYNCED",
            message: "Plan no sincronizado con Mercado Pago",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const resolvedRecord = resolved as unknown as Record<string, unknown>;
      catalogRow = {
        id: String(resolvedRecord.id ?? ""),
        tier: String(resolvedRecord.tier ?? normalizedTier),
        cadence: String(resolvedRecord.cadence ?? normalizedCadence),
        tier_code: String(resolvedRecord.tier_code ?? ""),
        preapproval_plan_id: String(resolvedRecord.preapproval_plan_id ?? ""),
        amount: Number(resolvedRecord.amount || 0),
        currency: String(resolvedRecord.currency || ""),
        frequency: Number(resolvedRecord.frequency || 0),
        frequency_type: String(resolvedRecord.frequency_type || ""),
      };

      effectivePlanCode = normalizedTier === "starter"
        ? "STARTER"
        : normalizedTier === "growth"
        ? "GROWTH"
        : "PRO";
    }

    if (!effectivePlanCode || typeof effectivePlanCode !== "string") {
      return new Response(
        JSON.stringify({
          error: "PLAN_CODE_REQUIRED",
          message: "El campo plan_code o {tier,cadence} es requerido",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const canonicalPlanCode = normalizeCanonicalPlanCode(effectivePlanCode);

    // =============================================================================
    // 4. GET PLAN FROM DATABASE
    // =============================================================================
    const { data: plan, error: planError } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("code", canonicalPlanCode)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return new Response(
        JSON.stringify({
          error: "PLAN_NOT_FOUND",
          message: `Plan '${canonicalPlanCode}' no encontrado o inactivo`,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // If catalogRow is still null, try to resolve it from mp_plan_catalog using plan details
    if (!catalogRow && plan.price > 0) {
      let inferredTier = "";
      if (canonicalPlanCode === "STARTER") inferredTier = "starter";
      else if (canonicalPlanCode === "GROWTH") inferredTier = "growth";
      else if (canonicalPlanCode === "PRO") inferredTier = "pro";

      if (inferredTier) {
        const inferredCadence = requestedCadence;

        const { data: catalogRows } = await supabaseAdmin
          .from("mp_plan_catalog")
          .select(
            "id, tier, cadence, tier_code, preapproval_plan_id, amount, currency, frequency, frequency_type",
          )
          .eq("tier", inferredTier)
          .eq("cadence", inferredCadence)
          .limit(1);

        if (catalogRows && catalogRows.length > 0) {
          const row = catalogRows[0];
          catalogRow = {
            id: String(row.id),
            tier: String(row.tier),
            cadence: String(row.cadence),
            tier_code: String(row.tier_code),
            preapproval_plan_id: String(row.preapproval_plan_id || ""),
            amount: Number(row.amount || 0),
            currency: String(row.currency || ""),
            frequency: Number(row.frequency || 0),
            frequency_type: String(row.frequency_type || ""),
          };
        }
      }
    }

    // Free plan doesn't need Mercado Pago
    if (plan.price === 0) {
      if (!business) {
        return new Response(
          JSON.stringify({
            error: "BUSINESS_REQUIRED",
            message: "Se requiere un negocio para activar el plan gratuito",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      // Create free subscription directly
      const now = new Date();
      const periodEnd = new Date(
        now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000,
      );

      const { data: subscription, error: subError } = await supabaseAdmin
        .from("business_subscriptions")
        .insert({
          business_id: business.id,
          tenant_id: business.owner_id,
          plan_code: plan.code,
          status: "active",
          period_start: now.toISOString(),
          period_end: periodEnd.toISOString(),
          start_date: now.toISOString(),
          next_billing_date: periodEnd.toISOString(),
          mp_preapproval_status: "active",
        })
        .select()
        .single();

      if (subError) {
        return new Response(
          JSON.stringify({
            error: "SUBSCRIPTION_FAILED",
            message: "Error al crear suscripción gratuita",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          subscription: subscription,
          init_point: null,
          message: "Suscripción gratuita activada",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // =============================================================================
    // 5. CREATE MERCADO PAGO PREAPPROVAL
    // =============================================================================
    const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");
    if (!mpAccessToken) {
      return new Response(
        JSON.stringify({
          error: "MP_CONFIG_ERROR",
          message: "Mercado Pago no configurado en el servidor",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Calculate billing dates
    const now = new Date();

    let accountFirstRecord:
      | { id: string; external_reference: string | null }
      | null = null;
    let accountFirstEmail: string | null = null;

    if (isPendingSignupIntent) {
      const pendingSignupEmailHmac = sanitizeIntentText(
        pendingSignupIntent?.email_hmac,
        512,
      );
      const pendingSignupEmailEncrypted = sanitizeIntentText(
        pendingSignupIntent?.email_encrypted,
        4096,
      );
      try {
        accountFirstEmail = pendingSignupEmailEncrypted
          ? await verifyPendingSignupPiiField(
            "email",
            pendingSignupEmailEncrypted,
            pendingSignupEmailHmac,
          )
          : null;
        await verifyOptionalProtectedAccountFirstField(
          "first_name",
          pendingSignupIntent?.first_name_encrypted,
          pendingSignupIntent?.first_name_hmac,
        );
        await verifyOptionalProtectedAccountFirstField(
          "last_name",
          pendingSignupIntent?.last_name_encrypted,
          pendingSignupIntent?.last_name_hmac,
        );
        await verifyOptionalProtectedAccountFirstField(
          "business_name",
          pendingSignupIntent?.business_name_encrypted,
          pendingSignupIntent?.business_name_hmac,
        );
        await verifyOptionalProtectedAccountFirstField(
          "phone",
          pendingSignupIntent?.phone_encrypted,
          pendingSignupIntent?.phone_hmac,
        );
      } catch {
        return new Response(
          JSON.stringify({
            error: "PENDING_SIGNUP_PII_INVALID",
            message: "Pending signup protected data is invalid",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (!pendingSignupEmailHmac || !accountFirstEmail) {
        return new Response(
          JSON.stringify({
            error: "PENDING_SIGNUP_EMAIL_REQUIRED",
            message: "Pending signup intent requires protected email",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const idempotencyHash = idempotencyKey
        ? await sha256Text(
          `pending-signup:${pendingSignupEmailHmac}:${canonicalPlanCode}:${idempotencyKey}`,
        )
        : null;
      const intentPayload = {
        email_encrypted: pendingSignupEmailEncrypted,
        email_hmac: pendingSignupEmailHmac,
        first_name_encrypted: sanitizeIntentText(
          pendingSignupIntent?.first_name_encrypted,
          4096,
        ),
        first_name_hmac: sanitizeIntentText(
          pendingSignupIntent?.first_name_hmac,
          512,
        ),
        last_name_encrypted: sanitizeIntentText(
          pendingSignupIntent?.last_name_encrypted,
          4096,
        ),
        last_name_hmac: sanitizeIntentText(
          pendingSignupIntent?.last_name_hmac,
          512,
        ),
        business_name_encrypted: sanitizeIntentText(
          pendingSignupIntent?.business_name_encrypted,
          4096,
        ),
        business_name_hmac: sanitizeIntentText(
          pendingSignupIntent?.business_name_hmac,
          512,
        ),
        phone_encrypted: sanitizeIntentText(
          pendingSignupIntent?.phone_encrypted,
          4096,
        ),
        phone_hmac: sanitizeIntentText(pendingSignupIntent?.phone_hmac, 512),
        pii_crypto_version:
          sanitizeIntentText(pendingSignupIntent?.pii_crypto_version, 80) ||
          "pending_signup_pii_v1",
        business_type: accountFirstBusinessType,
        selected_business_types:
          Array.isArray(pendingSignupIntent?.selected_business_types)
            ? pendingSignupIntent.selected_business_types.map((item) =>
              sanitizeIntentText(item, 80)
            ).filter(Boolean)
            : accountFirstBusinessType
            ? [accountFirstBusinessType]
            : [],
        plan_code: plan.code,
        billing_period: requestedCadence,
        status: "created",
        provider: "mercado_pago",
        idempotency_key_hash: idempotencyHash,
        expires_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      };

      const { data: existingIntent } = idempotencyHash
        ? await supabaseAdmin
          .from("pending_signup_intents")
          .select("id, external_reference")
          .eq("idempotency_key_hash", idempotencyHash)
          .maybeSingle()
        : { data: null };

      if (existingIntent) {
        accountFirstRecord = existingIntent;
      } else {
        const { data: insertedIntent, error: intentError } = await supabaseAdmin
          .from("pending_signup_intents")
          .insert(intentPayload)
          .select("id, external_reference")
          .single();

        if (intentError || !insertedIntent) {
          return new Response(
            JSON.stringify({
              error: "PENDING_SIGNUP_INTENT_FAILED",
              message: "No se pudo preparar el alta paga",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
        accountFirstRecord = insertedIntent;
      }
    } else if (isAccountFirstIntent) {
      const accountFirstEmailHmac = sanitizeIntentText(
        accountFirstIntent?.email_hmac,
        512,
      );
      const accountFirstEmailEncrypted = sanitizeIntentText(
        accountFirstIntent?.email_encrypted,
        4096,
      );
      try {
        accountFirstEmail = accountFirstEmailEncrypted
          ? await verifyPendingSignupPiiField(
            "email",
            accountFirstEmailEncrypted,
            accountFirstEmailHmac,
          )
          : null;
        await verifyOptionalProtectedAccountFirstField(
          "first_name",
          accountFirstIntent?.first_name_encrypted,
          accountFirstIntent?.first_name_hmac,
        );
        await verifyOptionalProtectedAccountFirstField(
          "last_name",
          accountFirstIntent?.last_name_encrypted,
          accountFirstIntent?.last_name_hmac,
        );
        await verifyOptionalProtectedAccountFirstField(
          "business_name",
          accountFirstIntent?.business_name_encrypted,
          accountFirstIntent?.business_name_hmac,
        );
        await verifyOptionalProtectedAccountFirstField(
          "phone",
          accountFirstIntent?.phone_encrypted,
          accountFirstIntent?.phone_hmac,
        );
      } catch {
        return new Response(
          JSON.stringify({
            error: "ACCOUNT_FIRST_PII_INVALID",
            message: "Account-first protected data is invalid",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (!accountFirstEmailHmac || !accountFirstEmail) {
        return new Response(
          JSON.stringify({
            error: "ACCOUNT_FIRST_EMAIL_REQUIRED",
            message: "Account-first intent requires protected email",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const idempotencyHash = idempotencyKey
        ? await sha256Text(
          `account-first:${accountFirstEmailHmac}:${canonicalPlanCode}:${idempotencyKey}`,
        )
        : null;
      const intentPayload = {
        email_encrypted: accountFirstEmailEncrypted,
        email_hmac: accountFirstEmailHmac,
        first_name_encrypted: sanitizeIntentText(
          accountFirstIntent?.first_name_encrypted,
          4096,
        ),
        first_name_hmac: sanitizeIntentText(
          accountFirstIntent?.first_name_hmac,
          512,
        ),
        last_name_encrypted: sanitizeIntentText(
          accountFirstIntent?.last_name_encrypted,
          4096,
        ),
        last_name_hmac: sanitizeIntentText(
          accountFirstIntent?.last_name_hmac,
          512,
        ),
        business_name_encrypted: sanitizeIntentText(
          accountFirstIntent?.business_name_encrypted,
          4096,
        ),
        business_name_hmac: sanitizeIntentText(
          accountFirstIntent?.business_name_hmac,
          512,
        ),
        phone_encrypted: sanitizeIntentText(
          accountFirstIntent?.phone_encrypted,
          4096,
        ),
        phone_hmac: sanitizeIntentText(accountFirstIntent?.phone_hmac, 512),
        pii_crypto_version:
          sanitizeIntentText(accountFirstIntent?.pii_crypto_version, 80) ||
          "account_first_pii_v1",
        business_type: accountFirstBusinessType,
        selected_business_types:
          Array.isArray(accountFirstIntent?.selected_business_types)
            ? accountFirstIntent.selected_business_types.map((item) =>
              sanitizeIntentText(item, 80)
            ).filter(Boolean)
            : accountFirstBusinessType
            ? [accountFirstBusinessType]
            : [],
        plan_code: plan.code,
        billing_period: requestedCadence,
        status: "created",
        provider: "mercado_pago",
        idempotency_key_hash: idempotencyHash,
        expires_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      };

      const { data: existingIntent } = idempotencyHash
        ? await supabaseAdmin
          .from("account_first_intents")
          .select("id, external_reference")
          .eq("idempotency_key_hash", idempotencyHash)
          .maybeSingle()
        : { data: null };

      if (existingIntent) {
        accountFirstRecord = existingIntent;
      } else {
        const { data: insertedIntent, error: intentError } = await supabaseAdmin
          .from("account_first_intents")
          .insert(intentPayload)
          .select("id, external_reference")
          .single();

        if (intentError || !insertedIntent) {
          return new Response(
            JSON.stringify({
              error: "ACCOUNT_FIRST_INTENT_FAILED",
              message: "No se pudo preparar el alta paga",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
        accountFirstRecord = insertedIntent;
      }
    }

    if (!business && !accountFirstRecord) {
      return new Response(
        JSON.stringify({
          error: "BUSINESS_REQUIRED",
          message: "Se requiere un negocio para crear una suscripción",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const rolloutDecision = evaluatePreapprovalPlanRollout({
      tenantId: business?.owner_id || accountFirstRecord?.id ||
        "account_first",
      userId: user?.id || business?.owner_id || accountFirstRecord?.id ||
        "account_first",
      environment: (Deno.env.get("DENO_ENV") as
        | "development"
        | "staging"
        | "production"
        | undefined) || "production",
    });

    if (!rolloutDecision.allowed) {
      recordPreapprovalCreateMetric({
        tenantId: business?.owner_id || accountFirstRecord?.id ||
          "account_first",
        userId: user?.id || business?.owner_id || accountFirstRecord?.id ||
          "account_first",
        rolloutPercent: rolloutDecision.rolloutPercent,
        rolloutBucket: rolloutDecision.bucket,
        result: "blocked",
        retryable: false,
        idempotencyDecision: "not_applicable",
        latencyMs: Date.now() - requestStartedAt,
        httpStatus: 503,
      });

      return new Response(
        JSON.stringify({
          error: "ROLLOUT_BLOCKED",
          message:
            "Mercado Pago subscription flow temporarily unavailable for this tenant during canary rollout",
          rollout_percent: rolloutDecision.rolloutPercent,
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const subscriptionSessionToken = createOpaqueSubscriptionSessionToken();
    const idempotencyScope = business?.owner_id || accountFirstRecord?.id ||
      "account_first";
    const idempotencySuffix = idempotencyKey
      ? await sha256Text(
        `idem:${idempotencyScope}:${plan.code}:${idempotencyKey}`,
      )
      : subscriptionSessionToken;
    const externalReference = createSubscriptionSessionReference(
      idempotencySuffix,
    );
    const subscriptionSessionExpiresAt = new Date(
      now.getTime() + 30 * 60 * 1000,
    );

    if (accountFirstRecord) {
      if (isPendingSignupIntent) {
        const { error: pendingIntentUpdateError } = await supabaseAdmin
          .from("pending_signup_intents")
          .update({
            external_reference: externalReference,
            status: "created",
            updated_at: now.toISOString(),
          })
          .eq("id", accountFirstRecord.id);
        if (pendingIntentUpdateError) {
          return new Response(
            JSON.stringify({
              error: "PENDING_SIGNUP_INTENT_UPDATE_FAILED",
              message: "No se pudo preparar el alta paga",
              correlation_id: correlationId,
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json", "x-correlation-id": correlationId },
            },
          );
        }
      } else {
        const { error: accountFirstIntentUpdateError } = await supabaseAdmin
          .from("account_first_intents")
          .update({
            external_reference: externalReference,
            status: "created",
            updated_at: now.toISOString(),
          })
          .eq("id", accountFirstRecord.id);
        if (accountFirstIntentUpdateError) {
          return new Response(
            JSON.stringify({
              error: "ACCOUNT_FIRST_INTENT_UPDATE_FAILED",
              message: "No se pudo preparar el alta paga",
              correlation_id: correlationId,
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json", "x-correlation-id": correlationId },
            },
          );
        }
      }
    }

    const { data: subscriptionSession, error: subscriptionSessionError } =
      await supabaseAdmin
        .from("billing_checkout_sessions")
        .insert({
          tenant_id: business?.owner_id || null,
          business_id: business?.id || null,
          plan_code: plan.code,
          expected_amount: catalogRow &&
              Number((catalogRow as Record<string, unknown>).amount) > 0
            ? Number((catalogRow as Record<string, unknown>).amount)
            : planPriceForCadence(plan, requestedCadence),
          expected_currency: String(
            (catalogRow as Record<string, unknown> | null)?.currency ||
              plan.currency,
          ),
          provider: "mercado_pago",
          external_reference: externalReference,
          token_hash: await sha256Text(subscriptionSessionToken),
          expires_at: subscriptionSessionExpiresAt.toISOString(),
          created_by: user?.id || business?.owner_id || null,
          account_first_intent_id: isAccountFirstIntent
            ? accountFirstRecord?.id || null
            : null,
          pending_signup_intent_id: isPendingSignupIntent
            ? accountFirstRecord?.id || null
            : null,
        })
        .select("id, external_reference")
        .single();

    if (subscriptionSessionError || !subscriptionSession) {
      if (idempotencyKey && subscriptionSessionError?.code === "23505") {
        return new Response(
          JSON.stringify({
            error: "IDEMPOTENCY_KEY_CONFLICT",
            message:
              "Ya existe una sesión de suscripción para esta clave de idempotencia",
            correlation_id: correlationId,
          }),
          {
            status: 409,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "x-correlation-id": correlationId,
            },
          },
        );
      }
      console.error(
        "Subscription session insert error:",
        subscriptionSessionError?.message,
      );
      return new Response(
        JSON.stringify({
          error: "SUBSCRIPTION_SESSION_FAILED",
          message: "Error al crear sesión segura de suscripción",
          correlation_id: correlationId,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "x-correlation-id": correlationId,
          },
        },
      );
    }

    // Build MP preapproval request
    const payerEmail = user?.email || accountFirstEmail;
    if (!payerEmail) {
      return new Response(
        JSON.stringify({
          error: "EMAIL_REQUIRED",
          message: "Se requiere un email para procesar el pago",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // We are using 'Suscripción sin plan asociado' so we build the plan dynamically.

    const catalogRecord = catalogRow as Record<string, unknown> | null;
    const recurring = catalogRecord && Number(catalogRecord.amount) > 0
      ? {
        frequency: Number(catalogRecord.frequency || 1),
        frequency_type: String(catalogRecord.frequency_type || "months"),
        transaction_amount: Number(catalogRecord.amount),
        currency_id: String(catalogRecord.currency || plan.currency || "ARS"),
      }
      : {
        frequency: planFrequencyForCadence(plan, requestedCadence).frequency,
        frequency_type:
          planFrequencyForCadence(plan, requestedCadence).frequencyType,
        transaction_amount: planPriceForCadence(plan, requestedCadence),
        currency_id: plan.currency || "ARS",
      };

    const mpPreapprovalRequest: Record<string, unknown> = {
      payer_email: payerEmail,
      back_url: buildAppUrl(
        `billing/subscription?plan=${plan.code}&billing=${requestedCadence}&subscription_session_id=${
          encodeURIComponent(externalReference)
        }`,
      ),
      reason: `${plan.name} - Orvel`,
      external_reference: externalReference,
      status: "pending",
      auto_recurring: recurring,
    };

    // Create preapproval in Mercado Pago
    const mpResponse = await fetch(`${MP_API_BASE}/preapproval`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${mpAccessToken}`,
        ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(mpPreapprovalRequest),
    });

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text();
      const upstreamError = sanitizeMercadoPagoError(
        errorText,
        mpResponse.status,
      );
      recordPreapprovalCreateMetric({
        tenantId: business?.owner_id || accountFirstRecord?.id ||
          "account_first",
        userId: user?.id || business?.owner_id || accountFirstRecord?.id ||
          "account_first",
        rolloutPercent: rolloutDecision.rolloutPercent,
        rolloutBucket: rolloutDecision.bucket,
        result: "error",
        retryable: mpResponse.status >= 500 || mpResponse.status === 429,
        idempotencyDecision: "not_applicable",
        latencyMs: Date.now() - requestStartedAt,
        httpStatus: mpResponse.status,
      });
      console.error("Mercado Pago API Error", {
        correlation_id: correlationId,
        status: mpResponse.status,
        mode: "associated_plan",
        responseSize: errorText.length,
        upstream_error: upstreamError,
      });
      return new Response(
        JSON.stringify({
          error: "MP_API_ERROR",
          message: "Error al crear pre-aprobación en Mercado Pago",
          upstream_error: upstreamError,
          correlation_id: correlationId,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "x-correlation-id": correlationId,
          },
        },
      );
    }

    const mpData = await mpResponse.json();

    if (!mpData.id || !mpData.init_point) {
      return new Response(
        JSON.stringify({
          error: "MP_INVALID_RESPONSE",
          message: "Respuesta inválida de Mercado Pago",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { error: checkoutSessionProviderUpdateError } = await supabaseAdmin
      .from("billing_checkout_sessions")
      .update({
        provider_preference_id: mpData.id,
        provider_resource_id: mpData.id,
        provider_plan_id: mpData.preapproval_plan_id ||
          mpData.preapproval_plan?.id || null,
        status: "provider_created",
      })
      .eq("id", subscriptionSession.id);
    if (checkoutSessionProviderUpdateError) {
      return new Response(
        JSON.stringify({
          error: "SUBSCRIPTION_SESSION_UPDATE_FAILED",
          message: "Error al actualizar sesión segura de suscripción",
          correlation_id: correlationId,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json", "x-correlation-id": correlationId },
        },
      );
    }

    if (accountFirstRecord) {
      if (isPendingSignupIntent) {
        const { error: pendingProviderUpdateError } = await supabaseAdmin
          .from("pending_signup_intents")
          .update({
            provider_subscription_id: mpData.id,
            external_reference: externalReference,
            status: "provider_created",
            updated_at: new Date().toISOString(),
          })
          .eq("id", accountFirstRecord.id);
        if (pendingProviderUpdateError) {
          return new Response(
            JSON.stringify({
              error: "PENDING_SIGNUP_PROVIDER_UPDATE_FAILED",
              message: "No se pudo vincular el alta paga con Mercado Pago",
              correlation_id: correlationId,
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json", "x-correlation-id": correlationId },
            },
          );
        }
      } else {
        const { error: accountFirstProviderUpdateError } = await supabaseAdmin
          .from("account_first_intents")
          .update({
            provider_subscription_id: mpData.id,
            external_reference: externalReference,
            status: "provider_created",
            updated_at: new Date().toISOString(),
          })
          .eq("id", accountFirstRecord.id);
        if (accountFirstProviderUpdateError) {
          return new Response(
            JSON.stringify({
              error: "ACCOUNT_FIRST_PROVIDER_UPDATE_FAILED",
              message: "No se pudo vincular el alta paga con Mercado Pago",
              correlation_id: correlationId,
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json", "x-correlation-id": correlationId },
            },
          );
        }
      }
    }

    // =============================================================================
    // 6. SAVE PENDING SUBSCRIPTION (Only if business exists)
    // =============================================================================
    let subscriptionId = null;
    if (business) {
      const subscriptionPayload = {
        business_id: business.id,
        tenant_id: business.owner_id,
        plan_code: plan.code,
        status: "pending",
        subscription_status: "pending",
        period_start: now.toISOString(),
        period_end: null, // Will be set when MP confirms payment
        current_period_start: now.toISOString(),
        current_period_end: null,
        provider: "mercado_pago",
        provider_subscription_id: mpData.id,
        provider_plan_id: mpData.preapproval_plan_id ||
          mpData.preapproval_plan?.id || null,
        mp_preapproval_id: mpData.id,
        mp_external_reference: externalReference,
        mp_preapproval_status: mpData.status || "pending",
        mp_preapproval_plan_id: mpData.preapproval_plan_id ||
          mpData.preapproval_plan?.id || null,
        start_date: now.toISOString(),
        updated_at: now.toISOString(),
      };

      const {
        data: existingPendingSubscription,
        error: existingPendingSubscriptionError,
      } = await supabaseAdmin
        .from("business_subscriptions")
        .select("id")
        .eq("business_id", business.id)
        .in("status", ["pending", "created", "pending_payment"])
        .is("provider_subscription_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingPendingSubscriptionError) {
        return new Response(
          JSON.stringify({
            error: "SUBSCRIPTION_LOOKUP_FAILED",
            message: "Error al buscar suscripción pendiente",
            correlation_id: correlationId,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json", "x-correlation-id": correlationId },
          },
        );
      }

      const subscriptionWrite = existingPendingSubscription?.id
        ? await supabaseAdmin
          .from("business_subscriptions")
          .update(subscriptionPayload)
          .eq("id", existingPendingSubscription.id)
          .select()
          .single()
        : await supabaseAdmin
          .from("business_subscriptions")
          .insert(subscriptionPayload)
          .select()
          .single();

      const { data: subscription, error: subError } = subscriptionWrite;

      if (subError) {
        console.error("Subscription insert error:", subError);
        return new Response(
          JSON.stringify({
            error: "SUBSCRIPTION_SAVE_FAILED",
            message: "Error al guardar suscripción",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      subscriptionId = subscription.id;
    }

    // =============================================================================
    // 7. RETURN INIT POINT TO FRONTEND
    // =============================================================================
    // Detect if using test token to return appropriate init_point
    // Mercado Pago returns BOTH init_point (production) AND sandbox_init_point (test)
    // Test tokens start with "TEST-" prefix
    const isTestMode = mpAccessToken.startsWith("TEST-");
    const effectiveInitPoint = isTestMode && mpData.sandbox_init_point
      ? mpData.sandbox_init_point
      : mpData.init_point;

    recordPreapprovalCreateMetric({
      tenantId: business?.owner_id || accountFirstRecord?.id ||
        "account_first",
      userId: user?.id || business?.owner_id || accountFirstRecord?.id ||
        "account_first",
      rolloutPercent: rolloutDecision.rolloutPercent,
      rolloutBucket: rolloutDecision.bucket,
      result: "success",
      retryable: false,
      idempotencyDecision: "not_applicable",
      latencyMs: Date.now() - requestStartedAt,
      httpStatus: 200,
    });

    return new Response(
      JSON.stringify({
        success: true,
        subscription: {
          id: subscriptionId,
          plan_code: plan.code,
          status: business
            ? "pending"
            : isPendingSignupIntent
            ? "pending_signup_intent"
            : "account_first_intent",
          mp_preapproval_id: mpData.id,
          external_reference: externalReference,
        },
        init_point: effectiveInitPoint,
        correlation_id: correlationId,
        // Include sandbox_init_point separately when in test mode for clarity
        ...(isTestMode && mpData.sandbox_init_point
          ? { sandbox_init_point: mpData.sandbox_init_point }
          : {}),
        message: "_redirect_to_mercadopago",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "x-correlation-id": correlationId,
        },
      },
    );
  } catch (error) {
    recordPreapprovalCreateMetric({
      tenantId: "unknown",
      userId: "unknown",
      rolloutPercent: 100,
      rolloutBucket: 0,
      result: "error",
      retryable: true,
      idempotencyDecision: "not_applicable",
      latencyMs: Date.now() - requestStartedAt,
      httpStatus: 500,
    });
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "INTERNAL_ERROR",
        message: "Error interno del servidor",
        correlation_id: correlationId,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "x-correlation-id": correlationId,
        },
      },
    );
  }
});
