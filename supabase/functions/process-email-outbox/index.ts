import { createClient } from "@supabase/supabase-js";
import * as AppointmentTemplates from "../_shared/templates/appointment-templates.ts";
import * as BusinessTemplates from "../_shared/templates/business-templates.ts";
import { buildDashboardUrl } from "../_shared/orvel-url.ts";

const MAILTRAP_API_URL = "https://send.api.mailtrap.io/api/send";

type AppointmentLinks = {
  view: string;
  cancel: string;
  reschedule: string;
};

type MaybeArray<T> = T | T[] | null | undefined;

type BookingEmailProjection = {
  id: string;
  business_id: string;
  starts_at: string | null;
  ends_at: string | null;
  duration_minutes?: number | null;
  price_at_booking?: number | null;
  customer?: MaybeArray<{ full_name?: string | null; email?: string | null }>;
  business?: MaybeArray<{ name?: string | null; address?: string | null }>;
  service?: MaybeArray<{ name?: string | null; duration_minutes?: number | null; price?: number | null }>;
};

type SupabaseServiceClient = any;

type OutboxRecord = {
  id?: string;
  to_email?: string;
  template_key?: string;
  payload?: Record<string, any>;
  booking_id?: string;
  sent_at?: string | null;
};

const MAX_SUBJECT_LENGTH = 180;

type OutboxClaimStatus = "send" | "already_sent" | "unavailable";

type OutboxClaimResult = {
  status: OutboxClaimStatus;
  claimId: string | null;
};

function sanitizeEmailSubject(value: unknown): string {
  const subject = typeof value === "string" && value.trim()
    ? value
    : "Notificación de Orvel";

  return subject
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SUBJECT_LENGTH) || "Notificación de Orvel";
}

function safeLogContext(record: { id?: unknown; template_key?: unknown; booking_id?: unknown } | undefined) {
  return {
    outbox_id: typeof record?.id === "string" ? record.id : undefined,
    template_key: typeof record?.template_key === "string" ? record.template_key : undefined,
    booking_id: typeof record?.booking_id === "string" ? record.booking_id : undefined,
  };
}

function getBearerToken(authorizationHeader: string | null): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader ?? "");
  return match?.[1]?.trim() || null;
}

function timingSafeEqualString(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}

function isRejectedPublicEmailRole(authorizationHeader: string | null): boolean {
  const bearerToken = getBearerToken(authorizationHeader)?.toLowerCase() ?? "";
  const role = getEmailInvocationJwtRole(authorizationHeader)?.toLowerCase() ?? "";
  return ["anon", "anonymous", "authenticated", "public", "publishable", "publishable_key"].includes(bearerToken) ||
    ["anon", "anonymous", "authenticated", "public", "publishable", "publishable_key"].includes(role);
}

function hasPrivilegedEmailInvocationAuthorization(authorizationHeader: string | null, serviceRoleKey: string | undefined): boolean {
  if (hasServiceRoleAuthorization(authorizationHeader, serviceRoleKey)) return true;

  // Secondary JWT role fallback is safe only because supabase/config.toml explicitly sets
  // [functions.process-email-outbox] verify_jwt=true. Supabase Edge Runtime rejects invalid
  // JWTs before this function executes, so this local decode is role extraction, not verification.
  return getEmailInvocationJwtRole(authorizationHeader) === "service_role";
}

function hasServiceRoleAuthorization(authorizationHeader: string | null, serviceRoleKey: string | undefined): boolean {
  // Fast path: exact service-role key bearer match. This remains preferred when local/remote
  // service-role key material is operationally aligned.
  const bearerToken = getBearerToken(authorizationHeader);
  if (!bearerToken) return false;
  if (!serviceRoleKey) return false;

  return timingSafeEqualString(bearerToken, serviceRoleKey);
}

function decodeJwtPayloadClaims(bearerToken: string): Record<string, unknown> | null {
  const parts = bearerToken.split(".");
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, "=");
    const json = new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)));
    const claims = JSON.parse(json);
    return claims && typeof claims === "object" && !Array.isArray(claims) ? claims as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function getEmailInvocationJwtRole(authorizationHeader: string | null): string | null {
  const bearerToken = getBearerToken(authorizationHeader);
  if (!bearerToken) return null;

  const claims = decodeJwtPayloadClaims(bearerToken);
  const role = claims?.role;
  return typeof role === "string" ? role : null;
}

// Basic HTML Template for generic fallback
function renderFallbackEmail(title: string, message: string): string {
  return `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; background: #f7f0e8;">
      <div style="background: #fff; padding: 32px; border-radius: 12px; border: 1px solid #ead8c7;">
        <h2 style="color: #8a5a36; margin-top: 0;">${title}</h2>
        <p>${message}</p>
      </div>
    </div>
  `;
}

function normalizeAppointmentLinks(rawLinks: unknown, baseUrl: string): AppointmentLinks {
  const links = rawLinks && typeof rawLinks === "object" ? rawLinks as Partial<AppointmentLinks> : {};
  const toAbsolute = (value: unknown): string => {
    if (typeof value !== "string" || !value.trim()) return "#";
    try {
      return new URL(value.trim(), baseUrl).toString();
    } catch {
      return "#";
    }
  };

  const view = toAbsolute(links.view);
  const cancel = toAbsolute(links.cancel);
  const reschedule = toAbsolute(links.reschedule);

  return { view, cancel, reschedule };
}

function relationOne<T>(value: MaybeArray<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

async function claimOutboxRecordBeforeProviderSend(
  supabase: SupabaseServiceClient | null,
  record: OutboxRecord,
): Promise<OutboxClaimResult> {
  if (record.sent_at) return { status: "already_sent", claimId: null };

  if (!record.id) {
    // Service-role, id-less manual test payloads cannot atomically claim a DB row.
    // Persisted outbox rows must include an id and use the claim RPC before any
    // booking/template enrichment or provider fetch.
    return { status: "send", claimId: null };
  }

  if (!supabase) {
    console.error("Unable to claim email outbox record without service database access", safeLogContext(record));
    return { status: "unavailable", claimId: null };
  }

  const claimId = crypto.randomUUID();
  const { data, error } = await supabase.rpc("claim_notification_email_outbox_for_send", {
    p_outbox_id: record.id,
    p_claim_id: claimId,
  });

  if (error) {
    console.error("Unable to claim email outbox record", safeLogContext(record));
    return { status: "unavailable", claimId: null };
  }

  if (data === "claimed") return { status: "send", claimId };
  if (data === "already_sent") return { status: "already_sent", claimId: null };
  return { status: "unavailable", claimId: null };
}

async function clearOutboxClaimAfterProviderError(
  supabase: SupabaseServiceClient | null,
  record: OutboxRecord,
  claimId: string | null,
  processingError = "mailtrap_error",
): Promise<void> {
  if (!supabase || !record.id || !claimId) return;

  const { error } = await supabase
    .from("notification_email_outbox")
    .update({
      processing_claim_id: null,
      processing_claimed_at: null,
      processing_error: processingError,
    })
    .eq("id", record.id)
    .eq("processing_claim_id", claimId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Unable to clear email outbox processing claim", safeLogContext(record));
  }
}

async function markOutboxRecordSent(
  supabase: SupabaseServiceClient | null,
  record: OutboxRecord,
  claimId: string | null,
): Promise<boolean> {
  if (!record.id) return true;
  if (!supabase) return false;

  let update = supabase
    .from("notification_email_outbox")
    .update({
      sent_at: new Date().toISOString(),
      processing_claim_id: null,
      processing_claimed_at: null,
      processing_error: null,
    })
    .eq("id", record.id);

  if (claimId) {
    update = update.eq("processing_claim_id", claimId);
  }

  const { data, error } = await update.select("id").maybeSingle();

  if (error) {
    console.error("Unable to mark email outbox record sent", safeLogContext(record));
    return false;
  }

  if (!data) {
    console.error("Email outbox sent finalization matched no rows", safeLogContext(record));
    return false;
  }

  return true;
}

Deno.serve(async (req) => {
  try {
    const authorizationHeader = req.headers.get("Authorization");
    const payload = await req.json();
    console.log("Processing notification", safeLogContext(payload.record));

    const apiKey = Deno.env.get("MAILTRAP_API_TOKEN") || Deno.env.get("MAILTRAP_TOKEN") || Deno.env.get("MAILTRAP_API_KEY");
    const fromEmail = Deno.env.get("MAILTRAP_FROM_EMAIL") || "no-reply@orvel.test";
    const fromName = Deno.env.get("MAILTRAP_FROM_NAME") || "Orvel";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const dashboardUrl = buildDashboardUrl();
    const isPublicEmailRoleRejected = isRejectedPublicEmailRole(authorizationHeader);
    const isPrivilegedEmailInvocationAuthorized = hasPrivilegedEmailInvocationAuthorization(authorizationHeader, serviceKey);

    if (!apiKey) {
      console.error("MAILTRAP_API_TOKEN is missing");
      return new Response(JSON.stringify({ error: "mailtrap_config_missing" }), { status: 500 });
    }

    const record = payload.record as OutboxRecord | undefined;

    if (payload.type === "DIRECT_SEND") {
      return new Response(JSON.stringify({ error: "Direct email sends are disabled; use notification_email_outbox." }), { status: 403 });
    }

    if (payload.type === "INSERT" && payload.table === "notification_email_outbox" && record) {
      const { to_email, template_key = "manual_notification", payload: emailData = {}, booking_id } = record;
      const supabase = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

      if (isPublicEmailRoleRejected) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }

      if (!isPrivilegedEmailInvocationAuthorized) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }

      if (!to_email) {
        return new Response(JSON.stringify({ error: "Missing outbox recipient" }), { status: 400 });
      }

      if (record.sent_at) {
        console.log("Email outbox record already sent; skipping", safeLogContext(record));
        return new Response(JSON.stringify({ success: true, skipped: "already_sent" }), { headers: { "Content-Type": "application/json" } });
      }

      const claim = await claimOutboxRecordBeforeProviderSend(supabase, record);
      if (claim.status === "already_sent") {
        console.log("Email outbox record already sent after recheck; skipping", safeLogContext(record));
        return new Response(JSON.stringify({ success: true, skipped: "already_sent" }), { headers: { "Content-Type": "application/json" } });
      }

      if (claim.status === "unavailable") {
        console.log("Email outbox record unavailable or already claimed before provider send", safeLogContext(record));
        return new Response(JSON.stringify({ success: false, skipped: "outbox_unavailable" }), { status: 409, headers: { "Content-Type": "application/json" } });
      }
      
      let subject = emailData?.subject || "Notificación de Orvel";
      let html = emailData?.html || "";
      
      // Data enrichment if HTML is missing or we need specific template data
      if (!html || booking_id) {
        let fullData: any = { ...emailData };
        
        if (supabase) {
          // 1. Fetch Booking/Business/Service details
          if (booking_id) {
            const { data: booking, error } = await supabase
              .from("bookings")
              .select("id, business_id, customer_id, service_id, starts_at, ends_at, duration_minutes, price_at_booking, customer:customers(full_name,email), business:businesses(name,address), service:services(name,duration_minutes,price)")
              .eq("id", booking_id)
              .single();
            
            if (!error && booking) {
              const bookingRow = booking as BookingEmailProjection;
              const customer = relationOne(bookingRow.customer);
              const business = relationOne(bookingRow.business);
              const service = relationOne(bookingRow.service);
              // 2. Fetch Business Settings for contact info
              const { data: settings } = await supabase
                .from("business_settings")
                .select("*")
                .eq("business_id", bookingRow.business_id)
                .maybeSingle();

              const appointmentLinks = normalizeAppointmentLinks(fullData.links, dashboardUrl);

              fullData = {
                ...fullData,
                customer: {
                  name: customer?.full_name || fullData.customer_name || "Cliente",
                  email: customer?.email || to_email
                },
                business: {
                  name: business?.name || fullData.business_name || "Orvel",
                  address: business?.address || settings?.address || "Consultar dirección"
                },
                service: {
                  name: service?.name || fullData.service_name || "Servicio"
                },
                date: bookingRow.starts_at || fullData.starts_at || fullData.date,
                time: bookingRow.starts_at 
                  ? new Date(bookingRow.starts_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) 
                  : (fullData.time || (fullData.starts_at ? new Date(fullData.starts_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : "--:--")),
                duration: service?.duration_minutes || bookingRow.duration_minutes || fullData.duration || 30,
                price: bookingRow.price_at_booking || service?.price || fullData.price || 0,
                contact: {
                  phone: settings?.support_phone || fullData.business_phone || "No especificado",
                  email: settings?.support_email || fromEmail
                },
                links: appointmentLinks
              };
            } else {
              // Fallback if booking query failed but we have payload
              fullData.date = fullData.date || fullData.starts_at;
              fullData.customer = fullData.customer || { name: fullData.customer_name || "Cliente", email: to_email };
              fullData.business = fullData.business || { name: fullData.business_name || "Orvel", address: "Consultar dirección" };
              fullData.service = fullData.service || { name: fullData.service_name || "Servicio" };
              fullData.contact = fullData.contact || { phone: "No especificado", email: fromEmail };
              fullData.links = fullData.links || { view: "#", cancel: "#", reschedule: "#" };
            }
          } else {
            // No booking_id, ensure minimal structure for template
            fullData.date = fullData.date || fullData.starts_at;
            fullData.customer = fullData.customer || { name: fullData.customer_name || "Cliente", email: to_email };
            fullData.business = fullData.business || { name: fullData.business_name || "Orvel", address: "Consultar dirección" };
            fullData.service = fullData.service || { name: fullData.service_name || "Servicio" };
            fullData.contact = fullData.contact || { phone: "No especificado", email: fromEmail };
            fullData.links = fullData.links || { view: "#", cancel: "#", reschedule: "#" };
          }

          // 3. Render Template based on key
          if (template_key === "appointment_confirmation" || template_key === "booking_created") {
            const result = AppointmentTemplates.renderAppointmentConfirmationEmail(fullData);
            subject = result.subject;
            html = result.html;
          } else if (template_key === "appointment_reminder_24h") {
            const result = AppointmentTemplates.renderAppointmentReminder24hEmail(fullData);
            subject = result.subject;
            html = result.html;
          } else if (template_key === "appointment_cancelled" || template_key === "booking_cancelled") {
            const result = AppointmentTemplates.renderAppointmentCancellationEmail(fullData);
            subject = result.subject;
            html = result.html;
          } else if (template_key === "appointment_rescheduled" || template_key === "booking_rescheduled") {
            const result = AppointmentTemplates.renderAppointmentRescheduleEmail(fullData);
            subject = result.subject;
            html = result.html;
          } else if (template_key.endsWith("_business")) {
            const result = AppointmentTemplates.renderAppointmentBusinessNotificationEmail(fullData);
            subject = result.subject;
            html = result.html;
          } else if (template_key === "business_welcome") {
            const result = BusinessTemplates.renderBusinessWelcomeEmail({
              business: { 
                name: fullData.business_name || "Tu Negocio", 
                ownerName: fullData.owner_name || "Propietario" 
              },
              dashboardUrl,
              supportContact: "soporte@orvel.app",
              firstLoginUrl: fullData.first_login_url,
              setPasswordUrl: fullData.set_password_url,
            });
            subject = result.subject;
            html = result.html;
          } else if (template_key === "welcome_email") {
            subject = "¡Bienvenido a Orvel!";
            html = renderFallbackEmail("¡Bienvenido!", `Hola ${fullData.customer?.name || "usuario"}, gracias por unirte a Orvel.`);
          }
        }
      }

      if (!html) {
        await clearOutboxClaimAfterProviderError(supabase, record, claim.claimId, "email_content_missing");
        return new Response(JSON.stringify({ error: "Email content missing" }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (html) {
        const providerSubject = sanitizeEmailSubject(subject);
        const mailtrapPayload = {
          from: { email: fromEmail, name: fromName },
          to: [{ email: to_email }],
          subject: providerSubject,
          html: html,
        };

        const res = await fetch(MAILTRAP_API_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(mailtrapPayload)
        });

        if (!res.ok) {
          await res.body?.cancel();
          await clearOutboxClaimAfterProviderError(supabase, record, claim.claimId);
          console.error("Failed to send email", {
            ...safeLogContext(record),
            provider_status: res.status,
          });
          return new Response(JSON.stringify({ error: "mailtrap_error" }), { status: 502 });
        } else {
          const finalized = await markOutboxRecordSent(supabase, record, claim.claimId);
          if (!finalized) {
            await res.body?.cancel();
            console.error("Email provider sent but outbox finalization failed", safeLogContext(record));
            return new Response(JSON.stringify({ error: "outbox_finalization_failed" }), { status: 502 });
          }

          console.log("Email successfully sent", safeLogContext(record));
          return new Response(JSON.stringify({ success: true, sent: true }), { headers: { "Content-Type": "application/json" } });
        }
      }

      return new Response(JSON.stringify({ error: "Email content missing" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      });
    }
    
    return new Response("No action taken", { status: 200 });
  } catch (err) {
    console.error("Error processing email", {
      error_name: err instanceof Error ? err.name : "UnknownError",
    });
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
});
