import { createClient } from "@supabase/supabase-js";
import * as AppointmentTemplates from "../_shared/templates/appointment-templates.ts";
import * as BusinessTemplates from "../_shared/templates/business-templates.ts";
import { buildDashboardUrl } from "../_shared/orvel-url.ts";

const SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send";

function safeLogContext(record: { id?: unknown; template_key?: unknown; booking_id?: unknown } | undefined) {
  return {
    outbox_id: typeof record?.id === "string" ? record.id : undefined,
    template_key: typeof record?.template_key === "string" ? record.template_key : undefined,
    booking_id: typeof record?.booking_id === "string" ? record.booking_id : undefined,
  };
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

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    console.log("Processing notification", safeLogContext(payload.record));

    const apiKey = Deno.env.get("SENDGRID_API_KEY");
    const fromEmail = Deno.env.get("SENDGRID_FROM_EMAIL") || "no-reply@orvel.test";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const dashboardUrl = buildDashboardUrl();

    if (!apiKey) {
      console.error("SENDGRID_API_KEY is missing");
      return new Response("Missing SendGrid API Key", { status: 500 });
    }

    const record = payload.record;
    const isDirect = payload.type === "DIRECT_SEND";

    if ((payload.type === "INSERT" && payload.table === "notification_email_outbox") || isDirect) {
      const { id, to_email, template_key, payload: emailData, booking_id } = record;
      
      let subject = emailData?.subject || "Notificación de Orvel";
      let html = emailData?.html || "";
      
      // Data enrichment if HTML is missing or we need specific template data
      if (!html || booking_id) {
        let fullData = { ...emailData };
        
        if (supabaseUrl && serviceKey) {
          const supabase = createClient(supabaseUrl, serviceKey);
          
          // 1. Fetch Booking/Business/Service details
          if (booking_id) {
            const { data: booking, error } = await supabase
              .from("bookings")
              .select("*, customer:customers(*), business:businesses(*), service:services(*)")
              .eq("id", booking_id)
              .single();
            
            if (!error && booking) {
              // 2. Fetch Business Settings for contact info
              const { data: settings } = await supabase
                .from("business_settings")
                .select("*")
                .eq("business_id", booking.business_id)
                .maybeSingle();

              const manageBaseUrl = `${dashboardUrl}/turnos/gestionar?token=${booking.manage_token}`;

              fullData = {
                ...fullData,
                customer: {
                  name: booking.customer?.full_name || fullData.customer_name || "Cliente",
                  email: booking.customer?.email || to_email
                },
                business: {
                  name: booking.business?.name || fullData.business_name || "Orvel",
                  address: booking.business?.address || settings?.address || "Consultar dirección"
                },
                service: {
                  name: booking.service?.name || fullData.service_name || "Servicio"
                },
                date: booking.starts_at || fullData.starts_at || fullData.date,
                time: booking.starts_at 
                  ? new Date(booking.starts_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) 
                  : (fullData.time || (fullData.starts_at ? new Date(fullData.starts_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : "--:--")),
                duration: booking.service?.duration_minutes || booking.duration_minutes || fullData.duration || 30,
                price: booking.price_at_booking || booking.service?.price || fullData.price || 0,
                contact: {
                  phone: settings?.support_phone || fullData.business_phone || "No especificado",
                  email: settings?.support_email || fromEmail
                },
                links: {
                  view: manageBaseUrl,
                  cancel: `${manageBaseUrl}&action=cancel`,
                  reschedule: `${manageBaseUrl}&action=reschedule`
                }
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
              supportContact: "soporte@orvel.app"
            });
            subject = result.subject;
            html = result.html;
          } else if (template_key === "welcome_email") {
            subject = "¡Bienvenido a Orvel!";
            html = renderFallbackEmail("¡Bienvenido!", `Hola ${fullData.customer?.name || "usuario"}, gracias por unirte a Orvel.`);
          }
        }
      }

      if (html) {
        const sgPayload = {
          personalizations: [{ to: [{ email: to_email }] }],
          from: { email: fromEmail, name: "Orvel" },
          subject: subject,
          content: [{ type: "text/html", value: html }]
        };

        const res = await fetch(SENDGRID_API_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(sgPayload)
        });

        if (!res.ok) {
          await res.body?.cancel();
          console.error("Failed to send email", {
            ...safeLogContext(record),
            provider_status: res.status,
          });
          return new Response(JSON.stringify({ error: "SendGrid Error" }), { status: 502 });
        } else {
          console.log("Email successfully sent", safeLogContext(record));
          if (id && supabaseUrl && serviceKey) {
            const supabase = createClient(supabaseUrl, serviceKey);
            await supabase.from("notification_email_outbox").update({ sent_at: new Date().toISOString() }).eq("id", id);
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }
    
    return new Response("No action taken", { status: 200 });
  } catch (err) {
    console.error("Error processing email", {
      error_name: err instanceof Error ? err.name : "UnknownError",
    });
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
});
