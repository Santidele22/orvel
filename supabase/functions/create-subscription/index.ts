// create-subscription Edge Function
// Creates a manual-mode subscription
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
} from "../_shared/plan-catalog.ts";
import {
  getBearerToken,
  shouldValidateCreateSubscriptionAuthorization,
} from "../_shared/create-subscription-auth.ts";
import { findAuthUserByEmail } from "../_shared/auth-duplicate-email.ts";
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

export interface CreateSubscriptionDependencies {
  createClient?: typeof createClient;
  envGet?: (key: string) => string | undefined;
}

interface Plan {
  id: string;
  code: string;
  name: string;
  price: number;
  currency: string;
  billing_frequency: number;
  billing_frequency_type: string;
}

interface SubscriptionRequest {
  plan_code: string;
  tier?: string;
  cadence?: string;
  preapproval_plan_id?: string;
  card_token_id?: string;
  billing_period?: string;
  mode?: string;
  pending_signup_reference?: string;
  pending_signup_token?: string;
  intent_reference?: string;
  intent_token?: string;
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

function sanitizePendingSignupReference(value: unknown): string | null {
  const reference = sanitizeIntentText(value, 180);
  return reference && /^psh_[A-Za-z0-9_-]{32,}$/.test(reference) ? reference : null;
}

function normalizeBillingCadence(
  value: unknown,
): "monthly" {
  if (typeof value !== "string") return "monthly";
  const normalized = value.trim().toLowerCase();
  return normalized === "monthly" ? normalized : "monthly";
}

async function verifyOptionalProtectedPendingSignupField(
  field: string,
  encryptedValue: unknown,
  hmacValue: unknown,
): Promise<void> {
  const hasEncrypted = typeof encryptedValue === "string" && encryptedValue.trim().length > 0;
  const hasHmac = typeof hmacValue === "string" && hmacValue.trim().length > 0;
  if (!hasEncrypted && !hasHmac) return;
  if (!hasEncrypted || !hasHmac) throw new Error("pending_signup_pii_pair_incomplete");
  await verifyPendingSignupPiiField(field, encryptedValue, hmacValue);
}

function planPriceForCadence(
  plan: Plan,
  cadence: "monthly",
): number {
  return Number(plan.price);
}

function getCanonicalIdempotencyKey(headers: Headers): string | null {
  return headers.get("Idempotency-Key")?.trim() ||
    headers.get("x-idempotency-key")?.trim() ||
    null;
}

export async function createSubscriptionHandler(
  req: Request,
  dependencies: CreateSubscriptionDependencies = {},
): Promise<Response> {
  const createSupabaseClient = dependencies.createClient ?? createClient;
  const envGet = dependencies.envGet ?? ((key: string) => Deno.env.get(key));
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
    // 2. VERIFY USER AUTHENTICATION (Optional for anonymous pending signup)
    // =============================================================================
    const authHeader = req.headers.get("Authorization");
    let user = null;
    let business = null;

    // Create Supabase client with admin privileges to bypass RLS
    const supabaseAdmin = createSupabaseClient(
      requireServerSecret("SUPABASE_URL"),
      requireServerSecret("SUPABASE_SERVICE_ROLE_KEY"),
    );

    if (
      shouldValidateCreateSubscriptionAuthorization({
        authHeader,
        requestBody: body,
        supabaseAnonKey: envGet("SUPABASE_ANON_KEY"),
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
    const pendingSignupIntent =
      body.mode === "pending_signup_intent" || body.pending_signup_intent
        ? body.pending_signup_intent || {}
        : null;
    const pendingSignupReference = sanitizePendingSignupReference(
      body.pending_signup_reference || body.pending_signup_token ||
        body.intent_reference || body.intent_token,
    );
    const requestedCadence = normalizeBillingCadence(
      body.cadence || body.billing_period ||
        pendingSignupIntent?.billing_period,
    );
    const pendingSignupBusinessType = sanitizeIntentText(
      pendingSignupIntent?.business_type || body.business_type,
      80,
    );
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
      if (!resolved || !String(resolved.preapproval_plan_id ?? "").trim()) {
        return new Response(
          JSON.stringify({
            error: "PREAPPROVAL_PLAN_MANUAL_CONFIGURATION_REQUIRED",
            message:
              "El plan Premium mensual de Mercado Pago requiere configuración manual antes de iniciar la suscripción.",
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
        preapproval_plan_id: String(resolvedRecord.preapproval_plan_id ?? "").trim(),
        amount: Number(resolvedRecord.amount || 0),
        currency: String(resolvedRecord.currency || ""),
        frequency: Number(resolvedRecord.frequency || 0),
        frequency_type: String(resolvedRecord.frequency_type || ""),
      };

      effectivePlanCode = "PREMIUM";
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
      if (canonicalPlanCode === "PREMIUM") inferredTier = "premium";

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
            preapproval_plan_id: String(row.preapproval_plan_id || "").trim(),
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

    // Calculate billing dates
    const now = new Date();

    let pendingSignupRecord:
      | { id: string; external_reference: string | null }
      | null = null;
    let referencedPendingIntent:
      | {
        id: string;
        external_reference: string | null;
        email_hmac: string | null;
        plan_code: string | null;
        billing_period: string | null;
        confirmation_status: string | null;
        email_confirmed_at: string | null;
      }
      | null = null;
    let pendingSignupEmail: string | null = null;

    if (isPendingSignupIntent) {
      const { data: referencedPendingIntentData } = pendingSignupReference
        ? await supabaseAdmin
          .from("pending_signup_intents")
          .select("id, external_reference, email_hmac, plan_code, billing_period, confirmation_status, email_confirmed_at")
          .eq("handoff_reference", pendingSignupReference)
          .in("status", ["created", "provider_created"])
          .gt("expires_at", now.toISOString())
          .maybeSingle()
        : { data: null };
      referencedPendingIntent = referencedPendingIntentData || null;
      if (pendingSignupReference && !referencedPendingIntent) {
        return new Response(
          JSON.stringify({
            error: "PENDING_SIGNUP_REFERENCE_INVALID",
            message: "No se encontró el alta paga pendiente",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const pendingSignupEmailHmac = sanitizeIntentText(
        pendingSignupIntent?.email_hmac,
        512,
      );
      const pendingSignupEmailEncrypted = sanitizeIntentText(
        pendingSignupIntent?.email_encrypted,
        4096,
      );
      try {
        pendingSignupEmail = pendingSignupEmailEncrypted
          ? await verifyPendingSignupPiiField(
            "email",
            pendingSignupEmailEncrypted,
            pendingSignupEmailHmac,
          )
          : null;
        await verifyOptionalProtectedPendingSignupField(
          "first_name",
          pendingSignupIntent?.first_name_encrypted,
          pendingSignupIntent?.first_name_hmac,
        );
        await verifyOptionalProtectedPendingSignupField(
          "last_name",
          pendingSignupIntent?.last_name_encrypted,
          pendingSignupIntent?.last_name_hmac,
        );
        await verifyOptionalProtectedPendingSignupField(
          "business_name",
          pendingSignupIntent?.business_name_encrypted,
          pendingSignupIntent?.business_name_hmac,
        );
        await verifyOptionalProtectedPendingSignupField(
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

      if (!pendingSignupEmailHmac || !pendingSignupEmail) {
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

      if (
        !referencedPendingIntent ||
        referencedPendingIntent.confirmation_status !== "confirmed" ||
        !referencedPendingIntent.email_confirmed_at
      ) {
        return new Response(
          JSON.stringify({
            error: "EMAIL_CONFIRMATION_REQUIRED",
            message: "Email confirmation is required before subscription activation",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (
        referencedPendingIntent &&
        (
          referencedPendingIntent.email_hmac !== pendingSignupEmailHmac ||
          normalizeCanonicalPlanCode(referencedPendingIntent.plan_code || "") !== canonicalPlanCode ||
          normalizeBillingCadence(referencedPendingIntent.billing_period) !== requestedCadence
        )
      ) {
        return new Response(
          JSON.stringify({
            error: "PENDING_SIGNUP_REFERENCE_MISMATCH",
            message: "Pending signup reference does not match the protected intent",
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
        first_name_encrypted: sanitizeIntentText(pendingSignupIntent?.first_name_encrypted, 4096),
        first_name_hmac: sanitizeIntentText(pendingSignupIntent?.first_name_hmac, 512),
        last_name_encrypted: sanitizeIntentText(pendingSignupIntent?.last_name_encrypted, 4096),
        last_name_hmac: sanitizeIntentText(pendingSignupIntent?.last_name_hmac, 512),
        business_name_encrypted: sanitizeIntentText(pendingSignupIntent?.business_name_encrypted, 4096),
        business_name_hmac: sanitizeIntentText(pendingSignupIntent?.business_name_hmac, 512),
        phone_encrypted: sanitizeIntentText(pendingSignupIntent?.phone_encrypted, 4096),
        phone_hmac: sanitizeIntentText(pendingSignupIntent?.phone_hmac, 512),
        pii_crypto_version: sanitizeIntentText(pendingSignupIntent?.pii_crypto_version, 80) || "pending_signup_pii_v1",
        business_type: pendingSignupBusinessType,
        selected_business_types:
          Array.isArray(pendingSignupIntent?.selected_business_types)
            ? pendingSignupIntent.selected_business_types.map((item) =>
              sanitizeIntentText(item, 80)
            ).filter(Boolean)
            : pendingSignupBusinessType ? [pendingSignupBusinessType] : [],
        plan_code: plan.code,
        billing_period: requestedCadence,
        status: "created",
        provider: "manual",
        idempotency_key_hash: idempotencyHash,
        expires_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      };

      const { user: duplicateUser, error: duplicateUserError } = await findAuthUserByEmail(
        supabaseAdmin,
        pendingSignupEmail,
      );

      if (duplicateUserError) {
        return new Response(
          JSON.stringify({
            error: "DUPLICATE_EMAIL_CHECK_FAILED",
            message: "No se pudo validar si el email ya tiene cuenta",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (duplicateUser) {
        return new Response(
          JSON.stringify({
            error: "EMAIL_ALREADY_REGISTERED",
            message: "Este email ya tiene una cuenta en Orvel",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      let duplicatePendingIntentQuery = supabaseAdmin
        .from("pending_signup_intents")
        .select("id")
        .eq("email_hmac", pendingSignupEmailHmac)
        .in("status", ["created", "provider_created", "approved", "materializing"])
        .gt("expires_at", now.toISOString());
      if (referencedPendingIntent?.id) {
        duplicatePendingIntentQuery = duplicatePendingIntentQuery.neq("id", referencedPendingIntent.id);
      }
      const { data: duplicatePendingIntent } = await duplicatePendingIntentQuery
        .limit(1)
        .maybeSingle();

      if (duplicatePendingIntent && !idempotencyHash) {
        return new Response(
          JSON.stringify({
            error: "PENDING_SIGNUP_ALREADY_EXISTS",
            message: "Ya existe un alta paga pendiente para este email",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { data: existingIntent } = idempotencyHash
        ? await supabaseAdmin
          .from("pending_signup_intents")
          .select("id, external_reference")
          .eq("idempotency_key_hash", idempotencyHash)
          .maybeSingle()
        : { data: null };

      if (referencedPendingIntent) {
        pendingSignupRecord = referencedPendingIntent;
      } else if (existingIntent) {
        pendingSignupRecord = existingIntent;
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
        pendingSignupRecord = insertedIntent;
      }
    }

    if (!business && !pendingSignupRecord) {
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

    const subscriptionSessionToken = createOpaqueSubscriptionSessionToken();
    const idempotencyScope = business?.owner_id || pendingSignupRecord?.id ||
      "pending_signup";
    const idempotencySuffix = idempotencyKey
      ? await sha256Text(
        `idem:${idempotencyScope}:${plan.code}:${idempotencyKey}`,
      )
      : subscriptionSessionToken;
    const externalReference = `preapproval-session:${idempotencySuffix.trim()}`;
    const subscriptionSessionExpiresAt = new Date(
      now.getTime() + 30 * 60 * 1000,
    );

    if (pendingSignupRecord) {
    const { data: updatedPendingExternalReference, error: pendingExternalReferenceUpdateError } = await supabaseAdmin
      .from("pending_signup_intents")
      .update({
        external_reference: externalReference,
        status: "created",
        updated_at: now.toISOString(),
      })
        .eq("id", pendingSignupRecord.id)
        .select("id")
        .single();
      if (pendingExternalReferenceUpdateError || !updatedPendingExternalReference) {
        return new Response(
          JSON.stringify({
            error: "PENDING_SIGNUP_SESSION_BIND_FAILED",
            message: "No se pudo persistir la sesión de pago. Reintentá en unos segundos.",
            correlation_id: correlationId,
          }),
          {
            status: 503,
            headers: { ...corsHeaders, "Content-Type": "application/json", "x-correlation-id": correlationId },
          },
        );
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
          provider: "manual",
          external_reference: externalReference,
          token_hash: await sha256Text(subscriptionSessionToken),
          expires_at: subscriptionSessionExpiresAt.toISOString(),
          created_by: user?.id || business?.owner_id || null,
          pending_signup_intent_id: pendingSignupRecord?.id || null,
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

    // =============================================================================
    // 6. SAVE PENDING SUBSCRIPTION (Only if business exists)
    // =============================================================================
    let subscriptionId = null;
    if (business) {
      const { data: subscription, error: subError } = await supabaseAdmin
        .from("business_subscriptions")
        .insert({
          business_id: business.id,
          tenant_id: business.owner_id,
          plan_code: plan.code,
          status: "pending",
          period_start: now.toISOString(),
          period_end: null, // Will be set when the manual payment is confirmed
          current_period_start: now.toISOString(),
          current_period_end: null,
          provider: "manual",
          start_date: now.toISOString(),
        })
        .select()
        .single();

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

    return new Response(
      JSON.stringify({
        success: true,
        subscription: {
          id: subscriptionId,
          plan_code: plan.code,
          status: business ? "pending" : "pending_signup_intent",
        },
        init_point: null,
        message: "manual_mode",
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
}

if (import.meta.main) {
  Deno.serve((req) => createSubscriptionHandler(req));
}
