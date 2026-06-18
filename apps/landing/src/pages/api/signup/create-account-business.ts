import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

type SignupPlan = "FREE" | "STARTER" | "GROWTH" | "PRO";

const ALLOWED_PLANS = new Set<SignupPlan>(["FREE", "STARTER", "GROWTH", "PRO"]);
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const rateLimitStore = new Map<string, number[]>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\r\n\t]+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizePlan(value: unknown): SignupPlan | null {
  const normalized = cleanText(value, 32)?.toUpperCase();
  if (normalized === "BASIC" || normalized === "STARTED") return "STARTER";
  if (normalized === "MEDIUM") return "GROWTH";
  return normalized && ALLOWED_PLANS.has(normalized as SignupPlan) ? (normalized as SignupPlan) : null;
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("client-ip") ||
    "unknown"
  );
}

function getCanonicalIdempotencyKey(request: Request): string | null {
  const value = request.headers.get("Idempotency-Key") || request.headers.get("x-idempotency-key");
  const normalized = value?.replace(/[\r\n\t]+/g, " ").trim();
  return normalized ? normalized.slice(0, 160) : null;
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isRateLimited(request: Request, email: string, idempotencyKey: string | null): Promise<boolean> {
  const now = Date.now();
  const emailHash = await sha256Text(email);
  const bucket = `${getClientIp(request)}:${emailHash}:${idempotencyKey || "no-idem"}`;
  const recent = (rateLimitStore.get(bucket) || []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitStore.set(bucket, recent);
    return true;
  }

  recent.push(now);
  rateLimitStore.set(bucket, recent);
  return false;
}

function slugifyBusinessName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base || "mi-negocio"}-${crypto.randomUUID().slice(0, 8)}`;
}

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json", message: "El pedido de alta no tiene un JSON válido." }, 400);
  }

  const email = cleanText(body.email, 320)?.toLowerCase();
  const password = cleanText(body.password, 256);
  const firstName = cleanText(body.nombre ?? body.first_name, 80);
  const lastName = cleanText(body.apellido ?? body.last_name, 80);
  const businessName = cleanText(body.negocioNombre ?? body.business_name, 120);
  const businessType = cleanText(body.rubro ?? body.business_type ?? body.tipoNegocio, 64)?.toLowerCase();
  const phone = cleanText(body.telefono ?? body.phone, 40);
  const plan = normalizePlan(body.plan);

  if (!email || !password || !firstName || !lastName || !businessName || !businessType || !plan) {
    return jsonResponse({ error: "signup_required_fields", message: "Faltan datos obligatorios para crear la cuenta y el negocio." }, 400);
  }

  const idempotencyKey = getCanonicalIdempotencyKey(request);
  if (await isRateLimited(request, email, idempotencyKey)) {
    return jsonResponse({ error: "RATE_LIMIT_EXCEEDED", message: "Demasiados intentos. Reintentá en unos minutos." }, 429);
  }

  const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "signup_config_error", message: "La configuración de alta no está disponible." }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const isPaidPlan = plan !== "FREE";
  const subscriptionStatus = isPaidPlan ? "pending_payment" : "active";
  const onboardingStep = isPaidPlan ? "payment_pending" : "welcome_login";
  let createdUserId: string | null = null;
  let createdBusinessId: string | null = null;

  async function cleanupProvisioning(): Promise<void> {
    if (createdBusinessId) {
      const { error: businessCleanupError } = await supabaseAdmin
        .from("businesses")
        .delete()
        .eq("id", createdBusinessId);
      if (businessCleanupError) {
        console.warn("signup_cleanup_business_failed", {
          business_id: createdBusinessId,
          error: businessCleanupError.message,
        });
      }
    }
    if (createdUserId) {
      const { error: userCleanupError } = await supabaseAdmin.auth.admin.deleteUser(
        createdUserId,
      );
      if (userCleanupError) {
        console.warn("signup_cleanup_user_failed", {
          user_id: createdUserId,
          error: userCleanupError.message,
        });
      }
    }
  }

  const { data: created, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: {
      nombre: firstName,
      apellido: lastName,
      negocioNombre: businessName,
      tipoNegocio: businessType,
      business_type: businessType,
      telefono: phone,
      plan,
      onboarding_required: true,
      onboarding_completed: false,
    },
  });

  if (createUserError || !created.user?.id) {
    const duplicate = /already|registered|exists/i.test(createUserError?.message ?? "");
    return jsonResponse(
      {
        ok: duplicate,
        error: duplicate ? "signup_existing_or_created" : "signup_create_failed",
        message: duplicate ? "Si la cuenta existe, continuá con el ingreso para seguir." : "No pudimos crear la cuenta.",
      },
      duplicate ? 202 : 502,
    );
  }

  const userId = created.user.id;
  createdUserId = userId;
  const businessId = crypto.randomUUID();
  const slug = slugifyBusinessName(businessName);

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
    id: userId,
    first_name: firstName,
    last_name: lastName,
    phone,
  });
  if (profileError) {
    await cleanupProvisioning();
    return jsonResponse({ error: "profile_create_failed", message: "No pudimos guardar el perfil." }, 502);
  }

  const { error: businessError } = await supabaseAdmin.from("businesses").insert({
    id: businessId,
    slug,
    name: businessName,
    owner_id: userId,
    timezone: "America/Argentina/Buenos_Aires",
  });
  if (businessError) {
    await cleanupProvisioning();
    return jsonResponse({ error: "business_create_failed", message: "No pudimos crear el negocio." }, 502);
  }
  createdBusinessId = businessId;

  const { error: settingsError } = await supabaseAdmin.from("business_settings").upsert({
    business_id: businessId,
    business_name: businessName,
    slug,
    business_type: businessType,
    plan: plan.toLowerCase(),
    support_phone: phone,
    updated_at: new Date().toISOString(),
  });
  if (settingsError) {
    await cleanupProvisioning();
    return jsonResponse({ error: "business_settings_failed", message: "No pudimos guardar la configuración del negocio." }, 502);
  }

  const { error: onboardingError } = await supabaseAdmin.from("business_onboarding_state").upsert({
    business_id: businessId,
    current_step: onboardingStep,
    selected_plan_code: plan,
    account_user_id: userId,
    business_type: businessType,
    updated_at: new Date().toISOString(),
  });
  if (onboardingError) {
    await cleanupProvisioning();
    return jsonResponse({ error: "onboarding_state_failed", message: "No pudimos preparar el onboarding." }, 502);
  }

  const { error: subscriptionError } = await supabaseAdmin.from("business_subscriptions").upsert({
    business_id: businessId,
    tenant_id: userId,
    plan_code: plan,
    subscription_status: subscriptionStatus,
    status: subscriptionStatus,
    updated_at: new Date().toISOString(),
  });
  if (subscriptionError) {
    await cleanupProvisioning();
    return jsonResponse({ error: "subscription_state_failed", message: "No pudimos preparar el estado de suscripción." }, 502);
  }

  return jsonResponse({
    ok: true,
    business_type: businessType,
    plan,
    subscription_status: subscriptionStatus,
  });
};
