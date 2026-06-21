import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

import { unprotectPendingSignupPii } from "../../../lib/server/pending-signup-pii-protection";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function cleanToken(value: string | null): string | null {
  const token = value?.trim();
  return token && /^sec_[A-Za-z0-9_-]{32,}$/.test(token) ? token : null;
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

function buildDashboardCallbackUrl(): string | undefined {
  const configured = import.meta.env.PUBLIC_DASHBOARD_URL || import.meta.env.DASHBOARD_URL;
  if (!configured) return undefined;
  return `${String(configured).replace(/\/$/, "")}/auth/callback`;
}

function isDuplicateUserError(error: unknown): boolean {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message || "") : String(error || "");
  return /already\s*(?:registered|exists)|duplicate|23505|EMAIL_ALREADY_REGISTERED|user_already_exists/i.test(message);
}

async function markMaterialization(supabaseAdmin: ReturnType<typeof createClient>, confirmationId: string, status: "failed_materialization" | "materialized", businessId?: string): Promise<void> {
  const { data, error: materializationError } = await supabaseAdmin.rpc("complete_signup_email_materialization", { p_confirmation_id: confirmationId, p_status: status, p_business_id: businessId });
  const updated = data === true || (Array.isArray(data) && data[0] === true);
  if (materializationError || !updated) {
    throw materializationError || new Error("signup_materialization_status_update_failed");
  }
}

async function cleanupJustCreatedAuthUser(supabaseAdmin: ReturnType<typeof createClient>, userId: string): Promise<void> {
  try {
    await supabaseAdmin.auth.admin.deleteUser(userId);
  } catch (error) {
    console.error("Failed to clean up unbound auth user after signup materialization bind failure", {
      user_id: userId,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}

export const GET: APIRoute = async ({ request }) => {
  const token = cleanToken(new URL(request.url).searchParams.get("token"));
  if (!token) return jsonResponse({ ok: false, error: "confirmation_invalid" }, 400);

  const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ ok: false, error: "signup_config_error" }, 500);

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
      return jsonResponse({ ok: true, status: "already_materialized", plan: retryable.data.plan_code });
    }
    if (retryable.data?.status === "failed_materialization") {
      await supabaseAdmin.from("signup_email_confirmations").update({ status: "materializing", updated_at: new Date().toISOString() }).eq("id", retryable.data.id).eq("status", "failed_materialization");
    }
    confirmation = retryable.data;
  }
  if (!confirmation) return jsonResponse({ ok: false, error: "confirmation_invalid_or_expired" }, 400);
  const effectiveConfirmationId = confirmation.confirmation_id || confirmation.id || confirmationId;

  if (confirmation.purpose === "paid_signup") {
    return jsonResponse({ ok: true, status: "email_confirmed", plan: confirmation.plan_code, pending_signup_reference: confirmation.pending_signup_reference });
  }

  const metadata = (confirmation.protected_metadata && typeof confirmation.protected_metadata === "object" ? confirmation.protected_metadata : {}) as Record<string, unknown>;
  let pii: Awaited<ReturnType<typeof unprotectPendingSignupPii>>;
  try {
    pii = await unprotectPendingSignupPii(confirmation as Record<string, unknown>);
  } catch {
    await markMaterialization(supabaseAdmin, effectiveConfirmationId, "failed_materialization");
    return jsonResponse({ ok: false, error: "confirmation_metadata_invalid" }, 422);
  }
  const email = cleanMetadataText(pii, "email", 320)?.toLowerCase();
  const firstName = cleanMetadataText(pii, "first_name", 80);
  const lastName = cleanMetadataText(pii, "last_name", 80);
  const businessName = cleanMetadataText(pii, "business_name", 120);
  const businessType = cleanMetadataText(metadata, "business_type", 64)?.toLowerCase();
  const phone = cleanMetadataText(pii, "phone", 40);
  if (!email || !firstName || !lastName || !businessName || !businessType) {
    await markMaterialization(supabaseAdmin, effectiveConfirmationId, "failed_materialization");
    return jsonResponse({ ok: false, error: "confirmation_metadata_invalid" }, 422);
  }

  const trustedUserId = typeof metadata.created_user_id === "string" ? metadata.created_user_id : null;
  let userId = trustedUserId;
  if (!userId) {
    const { data: created, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, phone, plan: "FREE", onboarding_required: true, onboarding_completed: false, source: "signup_email_confirmed" },
    });
    if (createUserError || !created.user?.id) {
      if (isDuplicateUserError(createUserError)) {
        await markMaterialization(supabaseAdmin, effectiveConfirmationId, "failed_materialization");
        return jsonResponse({ ok: false, error: "signup_materialize_failed" }, 202);
      }
      if (!userId) {
        await markMaterialization(supabaseAdmin, effectiveConfirmationId, "failed_materialization");
        return jsonResponse({ ok: false, error: "signup_materialize_failed" }, 502);
      }
    } else {
      const createdUserId = created.user.id;
      const { data: boundConfirmation, error: bindUserError } = await supabaseAdmin
        .from("signup_email_confirmations")
        .update({ protected_metadata: { ...metadata, created_user_id: createdUserId }, updated_at: new Date().toISOString() })
        .eq("id", effectiveConfirmationId)
        .eq("status", "materializing")
        .select("id")
        .single();
      if (bindUserError || !boundConfirmation) {
        await cleanupJustCreatedAuthUser(supabaseAdmin, createdUserId);
        await markMaterialization(supabaseAdmin, effectiveConfirmationId, "failed_materialization");
        return jsonResponse({ ok: false, error: "signup_materialize_failed" }, 502);
      }
      userId = createdUserId;
    }
  }

  const { data: existingBusiness } = await supabaseAdmin.from("businesses").select("id, slug").eq("owner_id", userId).limit(1).maybeSingle();
  const businessId = existingBusiness?.id || crypto.randomUUID();
  const slug = slugifyBusinessName(businessName);
  await supabaseAdmin.from("profiles").upsert({ id: userId, first_name: firstName, last_name: lastName, phone });
  const { error: businessError } = existingBusiness ? { error: null } : await supabaseAdmin.from("businesses").insert({ id: businessId, slug, name: businessName, owner_id: userId, timezone: "America/Argentina/Buenos_Aires", is_active: true });
  if (businessError) {
    await markMaterialization(supabaseAdmin, effectiveConfirmationId, "failed_materialization");
    return jsonResponse({ ok: false, error: "business_create_failed" }, 502);
  }

  const { data: settings, error: settingsError } = await supabaseAdmin.from("business_settings").upsert({ business_id: businessId, business_name: businessName, slug: existingBusiness?.slug || slug, business_type: businessType, plan: "free", support_phone: phone, updated_at: new Date().toISOString() }).select("business_id").single();
  const { data: onboarding, error: onboardingError } = await supabaseAdmin.from("business_onboarding_state").upsert({ business_id: businessId, current_step: "welcome_login", selected_plan_code: "FREE", account_user_id: userId, business_type: businessType, updated_at: new Date().toISOString() }).select("business_id").single();
  const { data: subscription, error: subscriptionError } = await supabaseAdmin.from("business_subscriptions").upsert({ business_id: businessId, tenant_id: userId, plan_code: "FREE", subscription_status: "active", status: "active", updated_at: new Date().toISOString() }).select("business_id").single();

  const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: buildDashboardCallbackUrl() } });
  const { data: welcome, error: welcomeOutboxError } = await supabaseAdmin.from("notification_email_outbox").insert({
    business_id: businessId,
    to_email: email,
    template_key: "business_welcome",
    payload: { business_name: businessName, owner_name: firstName, set_password_url: linkData?.properties?.action_link },
  }).select("id").single();

  if (settingsError || onboardingError || subscriptionError || welcomeOutboxError || !settings || !onboarding || !subscription || !welcome) {
    await markMaterialization(supabaseAdmin, effectiveConfirmationId, "failed_materialization");
    return jsonResponse({ ok: false, error: "signup_materialize_failed" }, 502);
  }

  const { data: materialized, error: completeError } = await supabaseAdmin.rpc("complete_signup_email_materialization", { p_confirmation_id: confirmation.confirmation_id || effectiveConfirmationId, p_status: "materialized", p_business_id: businessId });
  const updated = materialized === true || (Array.isArray(materialized) && materialized[0] === true);
  if (completeError || !updated) {
    return jsonResponse({ ok: false, error: "signup_materialize_failed" }, 502);
  }

  return jsonResponse({ ok: true, status: "welcome", business_id: businessId, plan: "FREE" });
};
