import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

import { unprotectPendingSignupPii } from "../../../lib/server/pending-signup-pii-protection";

function cleanToken(value: string | null): string | null {
  const token = value?.trim();
  return token && /^sec_[A-Za-z0-9_-]{32,}$/.test(token) ? token : null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildLoginUrl(): string {
  const configured = import.meta.env.PUBLIC_DASHBOARD_URL || import.meta.env.DASHBOARD_URL;
  if (!configured) return "/auth/login";
  return `${String(configured).replace(/\/$/, "")}/auth/login`;
}

function htmlResponse(state: { status: "materialized" | "already_materialized" | "email_confirmed" | "failed"; title: string; message: string; detail?: string; ctaUrl?: string; ctaLabel?: string; setCookie?: string }, httpStatus = 200): Response {
  const isSuccess = state.status !== "failed";
  const ctaUrl = state.ctaUrl || buildLoginUrl();
  const ctaLabel = state.ctaLabel || "Ingresar a Orvel";
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(state.title)} | Orvel</title>
    <style>
      :root { color-scheme: light; --bg: #fff7ed; --card: #ffffff; --text: #1f2937; --muted: #6b7280; --brand: #f97316; --brand-dark: #c2410c; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at top, #ffedd5, var(--bg)); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); }
      main { width: min(92vw, 520px); background: var(--card); border-radius: 28px; padding: 40px; box-shadow: 0 24px 70px rgba(194, 65, 12, 0.16); text-align: center; }
      .badge { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 999px; margin-bottom: 20px; background: ${isSuccess ? "#dcfce7" : "#fee2e2"}; color: ${isSuccess ? "#15803d" : "#b91c1c"}; font-size: 28px; font-weight: 800; }
      h1 { margin: 0 0 12px; font-size: clamp(28px, 5vw, 40px); line-height: 1.05; }
      p { margin: 0 auto 16px; color: var(--muted); line-height: 1.6; }
      a { display: inline-flex; margin-top: 18px; padding: 14px 22px; border-radius: 999px; background: var(--brand); color: white; text-decoration: none; font-weight: 700; box-shadow: 0 10px 24px rgba(249, 115, 22, 0.28); }
      a:hover { background: var(--brand-dark); }
      small { display: block; margin-top: 18px; color: #9ca3af; }
    </style>
  </head>
  <body>
    <main data-confirmation-status="${escapeHtml(state.status)}">
      <div class="badge" aria-hidden="true">${isSuccess ? "✓" : "!"}</div>
      <h1>${escapeHtml(state.title)}</h1>
      <p>${escapeHtml(state.message)}</p>
      ${state.detail ? `<small>${escapeHtml(state.detail)}</small>` : ""}
      ${isSuccess ? `<a href="${escapeHtml(ctaUrl)}">${escapeHtml(ctaLabel)}</a>` : ""}
    </main>
  </body>
</html>`;
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
  if (state.setCookie) headers.set("Set-Cookie", state.setCookie);
  return new Response(html, { status: httpStatus, headers });
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanMetadataText(metadata: Record<string, unknown>, key: string, maxLength: number): string | null {
  const value = metadata[key];
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\r\n\t]+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function slugifyBusinessName(name: string): string {
  const base = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `${base || "mi-negocio"}-${crypto.randomUUID().slice(0, 8)}`;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createOpaqueToken(prefix: string): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${prefix}_${bytesToBase64Url(bytes)}`;
}

function buildPaidSignupHandoffCookie(request: Request, binding: string): string {
  const url = new URL(request.url);
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".local");
  const secure = url.protocol === "https:" && !isLocalhost;
  const cookieName = secure ? "__Host-orvel_paid_signup_handoff" : "orvel_paid_signup_handoff";
  return `${cookieName}=${encodeURIComponent(binding)}; Path=/; Max-Age=${30 * 60}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

function buildPaidSignupContinuationUrl(confirmation: Record<string, unknown>): string | null {
  const pendingSignupReference = typeof confirmation.pending_signup_reference === "string" ? confirmation.pending_signup_reference : null;
  const planCode = typeof confirmation.plan_code === "string" ? confirmation.plan_code : null;
  const billingPeriod = typeof confirmation.billing_period === "string" ? confirmation.billing_period : "monthly";
  if (!pendingSignupReference || !planCode) return null;
  return `/billing/subscription?plan=${encodeURIComponent(planCode)}&billing=${encodeURIComponent(billingPeriod)}&signup_intent=pending_signup&pending_signup_reference=${encodeURIComponent(pendingSignupReference)}`;
}

async function bindPaidSignupHandoffAfterEmailProof(supabaseAdmin: ReturnType<typeof createClient>, request: Request, confirmation: Record<string, unknown>): Promise<{ redirectUrl: string; setCookie: string } | null> {
  const pendingSignupReference = typeof confirmation.pending_signup_reference === "string" ? confirmation.pending_signup_reference : null;
  const emailHmac = typeof confirmation.email_hmac === "string" ? confirmation.email_hmac : null;
  const redirectUrl = buildPaidSignupContinuationUrl(confirmation);
  if (!pendingSignupReference || !emailHmac || !redirectUrl) return null;

  const browserBinding = createOpaqueToken("psb");
  const { data, error } = await supabaseAdmin
    .from("pending_signup_intents")
    .update({ handoff_binding_hash: await sha256Text(browserBinding), handoff_created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("handoff_reference", pendingSignupReference)
    .eq("email_hmac", emailHmac)
    .eq("confirmation_status", "confirmed")
    .in("status", ["created", "provider_created"])
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (error || !data) return null;
  return { redirectUrl, setCookie: buildPaidSignupHandoffCookie(request, browserBinding) };
}

async function markMaterialization(supabaseAdmin: ReturnType<typeof createClient>, confirmationId: string, status: "failed_materialization" | "materialized", businessId?: string): Promise<void> {
  const { data, error: materializationError } = await supabaseAdmin.rpc("complete_signup_email_materialization", { p_confirmation_id: confirmationId, p_status: status, p_business_id: businessId });
  const updated = data === true || (Array.isArray(data) && data[0] === true);
  if (materializationError || !updated) {
    throw materializationError || new Error("signup_materialization_status_update_failed");
  }
}

export const GET: APIRoute = async ({ request }) => {
  const token = cleanToken(new URL(request.url).searchParams.get("token"));
  if (!token) return htmlResponse({ status: "failed", title: "Confirmación inválida", message: "El enlace no es válido o está incompleto. Pedí un nuevo correo de confirmación desde Orvel." }, 400);

  const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return htmlResponse({ status: "failed", title: "No pudimos confirmar tu email", message: "La configuración de alta no está disponible. Reintentá en unos minutos." }, 500);

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: consumed, error: consumeError } = await supabaseAdmin.rpc("consume_signup_email_confirmation", { p_token_hash: await sha256Text(token) });
  let confirmation = Array.isArray(consumed) ? consumed[0] : consumed;
  const confirmationId = confirmation?.confirmation_id || confirmation?.id;
  const tokenHash = await sha256Text(token);
  if (consumeError || !confirmation) {
    const retryable = await supabaseAdmin
      .from("signup_email_confirmations")
        .select("id,purpose,plan_code,billing_period,email_hmac,protected_metadata,email_encrypted,first_name_encrypted,first_name_hmac,last_name_encrypted,last_name_hmac,business_name_encrypted,business_name_hmac,phone_encrypted,phone_hmac,pii_crypto_version,pending_signup_reference,status")
      .eq("token_hash", tokenHash)
      .in("status", ["failed_materialization", "materialized"])
      .maybeSingle();
    if (retryable.data?.status === "materialized") {
        return htmlResponse({ status: "already_materialized", title: "Tu email ya estaba confirmado", message: "La cuenta ya está lista. Podés iniciar sesión con la contraseña que elegiste al registrarte." });
    }
    if (retryable.data?.status === "failed_materialization") {
      await supabaseAdmin.from("signup_email_confirmations").update({ status: "materializing", updated_at: new Date().toISOString() }).eq("id", retryable.data.id).eq("status", "failed_materialization");
    }
    confirmation = retryable.data;
  }
  if (!confirmation) return htmlResponse({ status: "failed", title: "Confirmación vencida", message: "El enlace de confirmación no existe o ya venció. Pedí uno nuevo desde Orvel.", detail: "confirmation_invalid_or_expired" }, 400);
  const effectiveConfirmationId = confirmation.confirmation_id || confirmation.id || confirmationId;

  if (confirmation.purpose === "paid_signup") {
    const handoff = await bindPaidSignupHandoffAfterEmailProof(supabaseAdmin, request, confirmation as Record<string, unknown>);
    return htmlResponse({
      status: "email_confirmed",
      title: "Email confirmado",
      message: handoff ? "Tu email quedó confirmado. Ya podés continuar con la suscripción." : "Tu email quedó confirmado. Volvé a Orvel para continuar con la suscripción.",
      ctaUrl: handoff?.redirectUrl,
      ctaLabel: handoff ? "Continuar con la suscripción" : undefined,
      setCookie: handoff?.setCookie,
    });
  }

  const metadata = (confirmation.protected_metadata && typeof confirmation.protected_metadata === "object" ? confirmation.protected_metadata : {}) as Record<string, unknown>;
  let pii: Awaited<ReturnType<typeof unprotectPendingSignupPii>>;
  try {
    pii = await unprotectPendingSignupPii(confirmation as Record<string, unknown>);
  } catch {
    await markMaterialization(supabaseAdmin, effectiveConfirmationId, "failed_materialization");
    return htmlResponse({ status: "failed", title: "No pudimos completar el alta", message: "La confirmación no tiene todos los datos necesarios. Pedí un nuevo enlace desde Orvel.", detail: "confirmation_metadata_invalid" }, 422);
  }
  const email = cleanMetadataText(pii, "email", 320)?.toLowerCase();
  const firstName = cleanMetadataText(pii, "first_name", 80);
  const lastName = cleanMetadataText(pii, "last_name", 80);
  const businessName = cleanMetadataText(pii, "business_name", 120);
  const businessType = cleanMetadataText(metadata, "business_type", 64)?.toLowerCase();
  const phone = cleanMetadataText(pii, "phone", 40);
  if (!email || !firstName || !lastName || !businessName || !businessType) {
    await markMaterialization(supabaseAdmin, effectiveConfirmationId, "failed_materialization");
    return htmlResponse({ status: "failed", title: "No pudimos completar el alta", message: "La confirmación no tiene todos los datos necesarios. Pedí un nuevo enlace desde Orvel.", detail: "confirmation_metadata_invalid" }, 422);
  }

  const trustedUserId = typeof metadata.created_user_id === "string" ? metadata.created_user_id : null;
  const userId = trustedUserId;
  if (!userId) {
    await markMaterialization(supabaseAdmin, effectiveConfirmationId, "failed_materialization");
    return htmlResponse({ status: "failed", title: "No pudimos completar el alta", message: "La confirmación no está vinculada a una cuenta creada por Orvel. Pedí un nuevo enlace.", detail: "signup_materialize_failed" }, 502);
  }

  const { data: existingBusiness } = await supabaseAdmin.from("businesses").select("id, slug").eq("owner_id", userId).limit(1).maybeSingle();
  const businessId = existingBusiness?.id || crypto.randomUUID();
  const slug = slugifyBusinessName(businessName);
  await supabaseAdmin.from("profiles").upsert({ id: userId, first_name: firstName, last_name: lastName, phone });
  const { error: businessError } = existingBusiness ? { error: null } : await supabaseAdmin.from("businesses").insert({ id: businessId, slug, name: businessName, owner_id: userId, timezone: "America/Argentina/Buenos_Aires" });
  if (businessError) {
    await markMaterialization(supabaseAdmin, effectiveConfirmationId, "failed_materialization");
    return htmlResponse({ status: "failed", title: "No pudimos completar el alta", message: "No pudimos preparar tu negocio. Reintentá con el mismo enlace en unos minutos.", detail: "signup_materialize_failed" }, 502);
  }

  const { data: settings, error: settingsError } = await supabaseAdmin.from("business_settings").upsert({ business_id: businessId, business_name: businessName, slug: existingBusiness?.slug || slug, business_type: businessType, plan: "free", support_phone: phone, updated_at: new Date().toISOString() }).select("business_id").single();
  const { data: onboarding, error: onboardingError } = await supabaseAdmin.from("business_onboarding_state").upsert({ business_id: businessId, current_step: "welcome_login", selected_plan_code: "FREE", account_user_id: userId, business_type: businessType, updated_at: new Date().toISOString() }).select("business_id").single();
  const { data: subscription, error: subscriptionError } = await supabaseAdmin.from("business_subscriptions").upsert({ business_id: businessId, tenant_id: userId, plan_code: "FREE", subscription_status: "active", status: "active", updated_at: new Date().toISOString() }).select("business_id").single();
  const welcomeResult = { data: true };
  const welcomeError = null;

  if (settingsError || onboardingError || subscriptionError || welcomeError || !settings || !onboarding || !subscription || !welcomeResult.data) {
    await markMaterialization(supabaseAdmin, effectiveConfirmationId, "failed_materialization");
    return htmlResponse({ status: "failed", title: "No pudimos completar el alta", message: "No pudimos dejar lista tu cuenta. Reintentá con el mismo enlace en unos minutos.", detail: "signup_materialize_failed" }, 502);
  }

  const { data: materialized, error: completeError } = await supabaseAdmin.rpc("complete_signup_email_materialization", { p_confirmation_id: confirmation.confirmation_id || effectiveConfirmationId, p_status: "materialized", p_business_id: businessId });
  const updated = materialized === true || (Array.isArray(materialized) && materialized[0] === true);
  if (completeError || !updated) {
    return htmlResponse({ status: "failed", title: "No pudimos completar el alta", message: "Tu email fue confirmado, pero no pudimos cerrar el alta. Reintentá con el mismo enlace.", detail: "signup_materialize_failed" }, 502);
  }

  return htmlResponse({ status: "materialized", title: "Confirmación lista", message: "Tu cuenta de Orvel ya está creada. Iniciá sesión con la contraseña que elegiste al registrarte." });
};
