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
      :root { color-scheme: dark; --bg: #0A0A0A; --surface: #121212; --surface-soft: #18181b; --text: #F1F5F9; --muted: #94A3B8; --brand: #7C3AED; --brand-dark: #6D28D9; --brand-soft: #A78BFA; --danger: #F87171; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: radial-gradient(circle at 18% 12%, rgba(124, 58, 237, 0.32), transparent 34%), radial-gradient(circle at 82% 0%, rgba(167, 139, 250, 0.18), transparent 28%), linear-gradient(135deg, var(--bg) 0%, #0f0f14 54%, #08080a 100%); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); }
      main { position: relative; overflow: hidden; width: min(92vw, 540px); background: linear-gradient(180deg, rgba(18, 18, 18, 0.96), rgba(18, 18, 18, 0.88)); border: 1px solid rgba(167, 139, 250, 0.22); border-radius: 32px; padding: clamp(32px, 7vw, 48px); box-shadow: 0 28px 90px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(124, 58, 237, 0.08) inset; text-align: center; }
      main::before { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(135deg, rgba(124, 58, 237, 0.2), transparent 42%); }
      .eyebrow, .badge, h1, p, a, small { position: relative; }
      .eyebrow { margin: 0 0 18px; color: var(--brand-soft); font-size: 12px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; }
      .badge { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 22px; margin-bottom: 22px; background: ${isSuccess ? "linear-gradient(135deg, #7C3AED, #6D28D9)" : "rgba(248, 113, 113, 0.14)"}; color: ${isSuccess ? "#F1F5F9" : "#F87171"}; border: 1px solid ${isSuccess ? "rgba(167, 139, 250, 0.5)" : "rgba(248, 113, 113, 0.28)"}; box-shadow: ${isSuccess ? "0 18px 42px rgba(124, 58, 237, 0.36)" : "0 18px 42px rgba(248, 113, 113, 0.16)"}; font-size: 30px; font-weight: 900; }
      h1 { margin: 0 0 14px; font-size: clamp(30px, 6vw, 44px); line-height: 1.02; letter-spacing: -0.04em; }
      p { margin: 0 auto 16px; max-width: 34rem; color: var(--muted); line-height: 1.65; font-size: 16px; }
      a { display: inline-flex; align-items: center; justify-content: center; gap: 8px; margin-top: 22px; padding: 15px 24px; border-radius: 999px; background: linear-gradient(135deg, var(--brand), var(--brand-dark)); color: #F1F5F9; text-decoration: none; font-weight: 800; box-shadow: 0 18px 36px rgba(124, 58, 237, 0.36); transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease; }
      a:hover { transform: translateY(-1px); box-shadow: 0 22px 44px rgba(124, 58, 237, 0.44); background: linear-gradient(135deg, var(--brand-soft), var(--brand)); }
      a:focus-visible { outline: 3px solid rgba(167, 139, 250, 0.7); outline-offset: 4px; }
      small { display: block; margin-top: 18px; color: #94A3B8; }
      @media (max-width: 480px) { body { padding: 16px; } main { border-radius: 26px; } a { width: 100%; } }
      @media (prefers-reduced-motion: reduce) { a { transition: none; } a:hover { transform: none; } }
    </style>
  </head>
  <body>
    <main data-confirmation-status="${escapeHtml(state.status)}">
      <p class="eyebrow">Orvel</p>
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

function trustedUserIdFromMetadata(confirmation: Record<string, unknown>): string | null {
  const metadata = (confirmation.protected_metadata && typeof confirmation.protected_metadata === "object" ? confirmation.protected_metadata : {}) as Record<string, unknown>;
  return typeof metadata.created_user_id === "string" && metadata.created_user_id.trim() ? metadata.created_user_id : null;
}

async function confirmTrustedAuthUserEmail(supabaseAdmin: ReturnType<typeof createClient>, userId: string): Promise<void> {
  const { data: authConfirmData, error: authConfirmError } = await supabaseAdmin.auth.admin.updateUserById(userId, { email_confirm: true });
  const authConfirmedUser = authConfirmData?.user;
  if (authConfirmError || !authConfirmedUser || authConfirmedUser.id !== userId) {
    throw authConfirmError || new Error("signup_auth_email_confirmation_failed");
  }
}

async function markTrustedAuthUserOnboardingComplete(
  supabaseAdmin: ReturnType<typeof createClient>,
  input: { userId: string; businessId: string; businessName: string; businessSlug: string; businessType: string },
): Promise<void> {
  const { data: authMetadataData, error: authMetadataError } = await supabaseAdmin.auth.admin.updateUserById(input.userId, {
    user_metadata: {
      onboardingCompleted: true,
      onboarding_completed: true,
      onboarding_required: false,
      business_type: input.businessType,
      tipoNegocio: input.businessType,
      business_id: input.businessId,
      business_name: input.businessName,
      business_slug: input.businessSlug,
      negocioNombre: input.businessName,
    },
  });
  const authMetadataUser = authMetadataData?.user;
  if (authMetadataError || !authMetadataUser || authMetadataUser.id !== input.userId) {
    throw authMetadataError || new Error("signup_auth_metadata_update_failed");
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
      const trustedUserId = trustedUserIdFromMetadata(retryable.data as Record<string, unknown>);
      if (!trustedUserId) {
        return htmlResponse({ status: "failed", title: "No pudimos completar el alta", message: "La confirmación no está vinculada a una cuenta creada por Orvel. Pedí un nuevo enlace.", detail: "signup_materialize_failed" }, 502);
      }
      try {
        await confirmTrustedAuthUserEmail(supabaseAdmin, trustedUserId);
      } catch {
        return htmlResponse({ status: "failed", title: "No pudimos completar el alta", message: "No pudimos confirmar tu acceso. Reintentá con el mismo enlace en unos minutos.", detail: "signup_materialize_failed" }, 502);
      }
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

  try {
    await confirmTrustedAuthUserEmail(supabaseAdmin, userId);
  } catch {
    await markMaterialization(supabaseAdmin, effectiveConfirmationId, "failed_materialization");
    return htmlResponse({ status: "failed", title: "No pudimos completar el alta", message: "No pudimos confirmar tu acceso. Reintentá con el mismo enlace en unos minutos.", detail: "signup_materialize_failed" }, 502);
  }

  const { data: existingBusiness } = await supabaseAdmin.from("businesses").select("id, slug").eq("owner_id", userId).limit(1).maybeSingle();
  const businessId = existingBusiness?.id || crypto.randomUUID();
  const slug = slugifyBusinessName(businessName);
  const businessSlug = existingBusiness?.slug || slug;
  await supabaseAdmin.from("profiles").upsert({ id: userId, first_name: firstName, last_name: lastName, phone });
  const { error: businessError } = existingBusiness ? { error: null } : await supabaseAdmin.from("businesses").insert({ id: businessId, slug, name: businessName, owner_id: userId, timezone: "America/Argentina/Buenos_Aires" });
  if (businessError) {
    await markMaterialization(supabaseAdmin, effectiveConfirmationId, "failed_materialization");
    return htmlResponse({ status: "failed", title: "No pudimos completar el alta", message: "No pudimos preparar tu negocio. Reintentá con el mismo enlace en unos minutos.", detail: "signup_materialize_failed" }, 502);
  }

  const dashboardReadyAt = new Date().toISOString();
  const { data: settings, error: settingsError } = await supabaseAdmin.from("business_settings").upsert({ business_id: businessId, business_name: businessName, slug: businessSlug, business_type: businessType, plan: "free", support_phone: phone, updated_at: dashboardReadyAt }).select("business_id").single();
  const { data: onboarding, error: onboardingError } = await supabaseAdmin.from("business_onboarding_state").upsert({ business_id: businessId, current_step: "dashboard_ready", dashboard_ready_at: dashboardReadyAt, selected_plan_code: "FREE", account_user_id: userId, business_type: businessType, updated_at: dashboardReadyAt }).select("business_id").single();
  const { data: subscription, error: subscriptionError } = await supabaseAdmin.from("business_subscriptions").upsert({ business_id: businessId, tenant_id: userId, plan_code: "FREE", subscription_status: "active", status: "active", updated_at: new Date().toISOString() }).select("business_id").single();
  const welcomeResult = { data: true };
  const welcomeError = null;

  if (settingsError || onboardingError || subscriptionError || welcomeError || !settings || !onboarding || !subscription || !welcomeResult.data) {
    await markMaterialization(supabaseAdmin, effectiveConfirmationId, "failed_materialization");
    return htmlResponse({ status: "failed", title: "No pudimos completar el alta", message: "No pudimos dejar lista tu cuenta. Reintentá con el mismo enlace en unos minutos.", detail: "signup_materialize_failed" }, 502);
  }

  try {
    await markTrustedAuthUserOnboardingComplete(supabaseAdmin, { userId, businessId, businessName, businessSlug, businessType });
  } catch {
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
