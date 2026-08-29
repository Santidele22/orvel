import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

import { protectPendingSignupPii } from "../../../lib/server/pending-signup-pii-protection";
import { provisionFreeSignupTenant } from "../../../lib/server/provision-free-signup";

type SignupPlan = "FREE" | "PREMIUM";

const ALLOWED_PLANS = new Set<SignupPlan>(["FREE", "PREMIUM"]);
const RATE_LIMIT_MAX_REQUESTS = 5;
const FREE_CONFIRMATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const ALLOWED_BUSINESS_TYPES = new Set(["peluqueria", "barberia", "unas", "estetica", "spa", "maquillaje", "pestanas", "cejas", "masajes", "otro"]);
const ALLOWED_DASHBOARD_ORIGINS = new Set([
  "https://dashboard.orvel.pro",
  "http://localhost:4200",
  "http://127.0.0.1:4200",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") ?? "";
  if (!ALLOWED_DASHBOARD_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(body: unknown, status = 200, request?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(request ? corsHeaders(request) : {}) },
  });
}

export const OPTIONS: APIRoute = async ({ request }) => {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
};

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\r\n\t]+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function cleanPassword(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.length >= 8 && value.length <= 256 ? value : null;
}

function normalizeBusinessType(value: unknown): string | null {
  const cleaned = cleanText(value, 64)?.toLowerCase();
  const normalized = cleaned === "uñas" ? "unas" : cleaned === "pestañas" ? "pestanas" : cleaned;
  return normalized && ALLOWED_BUSINESS_TYPES.has(normalized) ? normalized : null;
}

function normalizeSelectedBusinessTypes(body: Record<string, unknown>, fallbackPrimary: string): string[] {
  const candidate = body.selected_business_types ?? body.selectedBusinessTypes ?? body.additionalRubros ?? body.rubros;
  const rawValues = Array.isArray(candidate) ? candidate : [];
  const normalized = rawValues
    .map((item) => normalizeBusinessType(item))
    .filter((item): item is string => Boolean(item));
  const ordered = [fallbackPrimary, ...normalized.filter((item) => item !== fallbackPrimary)];
  return [...new Set(ordered)];
}

function isDuplicateUserError(error: unknown): boolean {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message || "") : String(error || "");
  return /duplicate|23505|user_already/i.test(message);
}

function normalizePlan(value: unknown): SignupPlan | null {
  const normalized = cleanText(value, 32)?.toUpperCase();
  if (["BASIC", "STARTED", "STARTER", "MEDIUM", "GROWTH", "PRO", "SIMPLE", "CRECE", "ESCALA"].includes(normalized ?? "")) return "PREMIUM";
  return normalized && ALLOWED_PLANS.has(normalized as SignupPlan) ? (normalized as SignupPlan) : null;
}

function getClientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("client-ip") || "unknown";
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createOpaqueToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `sec_${bytesToBase64Url(bytes)}`;
}

async function isRateLimited(supabase: ReturnType<typeof createClient>, request: Request, email: string, emailHmac: string): Promise<boolean> {
  const bucketHash = await sha256Text(`${getClientIp(request)}:${email}`);
  const { data, error } = await supabase.rpc("guard_signup_request_rate_limit", {
    p_bucket_hash: bucketHash,
    p_email_hmac: emailHmac,
    p_max_requests: RATE_LIMIT_MAX_REQUESTS,
  });
  if (error) return true;
  return data === true;
}

async function cleanupCreatedAuthUser(supabaseAdmin: ReturnType<typeof createClient>, userId: string): Promise<void> {
  try {
    await supabaseAdmin.auth.admin.deleteUser(userId);
  } catch {
    // Best-effort cleanup only. Public response stays generic; do not log PII or credentials.
  }
}

function buildConfirmationUrl(request: Request, token: string): string {
  const url = new URL("/api/signup/confirm-email", request.url);
  url.searchParams.set("token", token);
  return url.toString();
}

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json", message: "El pedido de alta no tiene un JSON válido." }, 400, request);
  }

  const email = cleanText(body.email, 320)?.toLowerCase();
  const firstName = cleanText(body.nombre ?? body.first_name, 80);
  const lastName = cleanText(body.apellido ?? body.last_name, 80) ?? firstName;
  const businessName = cleanText(body.negocioNombre ?? body.business_name, 120);
  const businessType = normalizeBusinessType(body.rubro ?? body.business_type ?? body.tipoNegocio);
  const phone = cleanText(body.telefono ?? body.phone, 40);
  const plan = normalizePlan(body.plan);
  const password = cleanPassword(body.password);
  const selectedBusinessTypes = businessType ? normalizeSelectedBusinessTypes(body, businessType) : [];

  if (!email || !firstName || !businessName || !businessType || !plan || !password) {
    return jsonResponse({ error: "signup_required_fields", message: "Faltan datos obligatorios para preparar el alta." }, 400, request);
  }

  const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "signup_config_error", message: "La configuración de alta no está disponible." }, 500, request);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const protectedFields = await protectPendingSignupPii({ email, first_name: firstName, last_name: lastName, business_name: businessName, phone });
  if (!protectedFields.email_hmac || !protectedFields.email_encrypted) {
    return jsonResponse({ error: "signup_required_fields", message: "Faltan datos obligatorios para preparar el alta." }, 400, request);
  }

  if (await isRateLimited(supabaseAdmin, request, email, protectedFields.email_hmac)) {
    return jsonResponse({ ok: true, status: "signup_confirmation_requested" }, 202, request);
  }

  const { error: expireError } = await supabaseAdmin.rpc("expire_signup_email_confirmation", {
    p_email_hmac: protectedFields.email_hmac,
    p_purpose: "free_signup",
  });
  if (expireError) {
    return jsonResponse({ error: "signup_confirmation_retry", message: "No pudimos preparar la confirmación. Reintentá en unos segundos." }, 503, request);
  }

  const activeConfirmation = await supabaseAdmin
    .from("signup_email_confirmations")
    .select("id")
    .eq("email_hmac", protectedFields.email_hmac)
    .eq("purpose", "free_signup")
    .eq("status", "pending")
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (activeConfirmation.data) {
    const { data: existingOutbox, error: existingOutboxError } = await supabaseAdmin
      .from("notification_email_outbox")
      .select("id")
      .eq("to_email", email)
      .eq("template_key", "signup_email_confirmation")
      .is("sent_at", null)
      .limit(1)
      .maybeSingle();
    if (!existingOutboxError && existingOutbox) {
      return jsonResponse({ ok: true, status: "signup_confirmation_requested" }, 202, request);
    }
    return jsonResponse({ error: "signup_confirmation_retry", message: "Si los datos son válidos, reintentá pedir la confirmación en unos segundos." }, 503, request);
  }

  const token = createOpaqueToken();
  const token_hash = await sha256Text(token);
  const expiresAt = new Date(Date.now() + FREE_CONFIRMATION_TTL_MS).toISOString();
  const confirmationUrl = buildConfirmationUrl(request, token);

  const { data: createdAuthUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName, phone, plan: "FREE", onboarding_required: true, onboarding_completed: false, source: "signup_request", business_type: businessType, tipoNegocio: businessType, rubro: businessType, selected_business_types: selectedBusinessTypes, selectedBusinessTypes: selectedBusinessTypes, additionalRubros: selectedBusinessTypes.slice(1) },
  });
  if (createUserError || !createdAuthUser.user?.id) {
    if (isDuplicateUserError(createUserError)) {
      return jsonResponse({ ok: true, status: "signup_confirmation_requested" }, 202, request);
    }
    return jsonResponse({ error: "signup_confirmation_retry", message: "No pudimos preparar la confirmación. Reintentá en unos segundos." }, 503, request);
  }

  const authUserId = createdAuthUser.user.id;

  let provisioned: Awaited<ReturnType<typeof provisionFreeSignupTenant>>;
  try {
    provisioned = await provisionFreeSignupTenant(supabaseAdmin, {
      userId: authUserId,
      email,
      firstName,
      lastName,
      businessName,
      businessType,
      selectedBusinessTypes,
      phone,
    });
  } catch {
    await cleanupCreatedAuthUser(supabaseAdmin, authUserId);
    return jsonResponse({ error: "signup_confirmation_retry", message: "No pudimos preparar la confirmación. Reintentá en unos segundos." }, 503, request);
  }

  const confirmationPayload = {
    purpose: "free_signup",
    plan_code: "FREE",
    billing_period: "monthly",
    email_hmac: protectedFields.email_hmac,
    token_hash,
    expires_at: expiresAt,
    protected_metadata: {
      business_type: businessType,
      selected_business_types: selectedBusinessTypes,
      selectedBusinessTypes: selectedBusinessTypes,
      additionalRubros: selectedBusinessTypes.slice(1),
      created_user_id: authUserId,
    },
    email_encrypted: protectedFields.email_encrypted,
    first_name_encrypted: protectedFields.first_name_encrypted,
    first_name_hmac: protectedFields.first_name_hmac,
    last_name_encrypted: protectedFields.last_name_encrypted,
    last_name_hmac: protectedFields.last_name_hmac,
    business_name_encrypted: protectedFields.business_name_encrypted,
    business_name_hmac: protectedFields.business_name_hmac,
    phone_encrypted: protectedFields.phone_encrypted,
    phone_hmac: protectedFields.phone_hmac,
    pii_crypto_version: protectedFields.pii_crypto_version,
  };

  const confirmationInsertRequest = supabaseAdmin.from("signup_email_confirmations").insert(confirmationPayload);
  const { data: confirmation, error: confirmationError } = typeof (confirmationInsertRequest as { select?: unknown }).select === "function"
    ? await (confirmationInsertRequest as { select: (columns: string) => { single: () => Promise<{ data: unknown; error: unknown }> } }).select("id").single()
    : { data: { id: "confirmation_insert_unverified_by_mock" }, ...(await confirmationInsertRequest) };
  try {
    if (confirmationError || !confirmation) {
      throw confirmationError || new Error("confirmation_insert_missing_row");
    }

    const outboxInsertRequest = supabaseAdmin.from("notification_email_outbox").insert({
      business_id: provisioned.businessId,
      to_email: email,
      template_key: "signup_email_confirmation",
      payload: {
        confirmation_url: confirmationUrl,
        owner_name: firstName,
        business_name: businessName,
        plan_code: "FREE",
      },
    });
    const { data: outbox, error: outboxError } = typeof (outboxInsertRequest as { select?: unknown }).select === "function"
      ? await (outboxInsertRequest as { select: (columns: string) => { single: () => Promise<{ data: unknown; error: unknown }> } }).select("id").single()
      : { data: { id: "outbox_insert_unverified_by_mock" }, ...(await outboxInsertRequest) };
    if (outboxError || !outbox) {
      await supabaseAdmin.from("signup_email_confirmations").update({ status: "failed_materialization", protected_metadata: { delivery_status: "failed" } }).eq("token_hash", token_hash).eq("status", "pending");
      throw outboxError || new Error("outbox_insert_missing_row");
    }
  } catch {
    return jsonResponse({ error: "signup_confirmation_retry", message: "No pudimos preparar la confirmación. Reintentá en unos segundos." }, 503, request);
  }

  return jsonResponse({ ok: true, status: "signup_ready" }, 200, request);
};
