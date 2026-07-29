export interface BusinessWelcomeEmailData {
  business: { name: string; ownerName: string };
  dashboardUrl: string;
  supportContact: string;
  firstLoginUrl?: string;
  setPasswordUrl?: string;
}

export interface SignupEmailConfirmationData {
  confirmationUrl: string;
  ownerName?: string;
  businessName?: string;
  planCode?: string;
}

export interface TrialUserActivationReminder {
  to: string;
  subject: string;
  html: string;
}

export interface TrialUserActivationReminderData {
  recipientEmail: string;
  businessName: string;
  dashboardUrl: string;
  bookingUrl: string;
}

const palette = {
  black: "#0A0A0A",
  panel: "#121212",
  text: "#F1F5F9",
  muted: "#94A3B8",
  violet: "#7C3AED",
  violetDark: "#6D28D9",
  violetSoft: "#A78BFA",
};

function renderShell(title: string, body: string): string {
  return `
    <!doctype html>
    <html lang="es-AR">
      <body style="margin:0;background:${palette.black};color:${palette.text};font-family:Arial,sans-serif;">
        <main style="max-width:640px;margin:0 auto;padding:32px;">
          <section style="background:${palette.panel};border:1px solid ${palette.violetDark};border-radius:24px;padding:32px;box-shadow:0 24px 80px rgba(124,58,237,.24);">
            <p style="letter-spacing:.18em;text-transform:uppercase;color:${palette.violetSoft};font-size:12px;margin:0 0 16px;">Orvel</p>
            <h1 style="margin:0 0 16px;font-size:30px;line-height:1.15;color:${palette.text};">${title}</h1>
            ${body}
          </section>
        </main>
      </body>
    </html>
  `;
}

export function renderSignupEmailConfirmation(data: SignupEmailConfirmationData): { subject: string; html: string } {
  const owner = data.ownerName || "";
  const title = `Confirmá tu email${owner ? `, ${escapeHtml(owner)}` : ""}`;
  return {
    subject: "Confirmá tu email para activar Orvel",
    html: renderShell(title, `
      <p style="color:${palette.muted};font-size:16px;line-height:1.6;">Antes de crear tu cuenta${data.businessName ? ` para ${escapeHtml(data.businessName)}` : ""}, necesitamos confirmar que este email es tuyo.</p>
      <p style="margin:28px 0;">
        <a href="${escapeAttribute(data.confirmationUrl)}" style="display:inline-block;background:${palette.violet};color:${palette.text};padding:14px 20px;border-radius:999px;text-decoration:none;font-weight:700;">Confirmar email</a>
      </p>
      <p style="color:${palette.muted};font-size:14px;line-height:1.5;">El enlace vence pronto y se puede usar una sola vez. Si no pediste esta alta, ignorá este mensaje.</p>
    `),
  };
}

export function renderBusinessWelcomeEmail(data: BusinessWelcomeEmailData): { subject: string; html: string } {
  const firstAccessUrl = data.setPasswordUrl || data.firstLoginUrl;
  const ctaUrl = firstAccessUrl || data.dashboardUrl;
  const ctaLabel = firstAccessUrl ? "Configurar contraseña e ingresar" : "Entrar al dashboard";
  const ctaIntro = firstAccessUrl
    ? "Para hacer tu primer ingreso, configurá tu contraseña con este enlace seguro."
    : "Podés entrar al dashboard para empezar a configurar tus turnos.";

  return {
    subject: `Bienvenida a Orvel, ${data.business.name}`,
    html: renderShell(`Bienvenida, ${escapeHtml(data.business.ownerName)}`, `
      <p style="color:${palette.muted};font-size:16px;line-height:1.6;">${escapeHtml(data.business.name)} ya tiene su espacio listo para gestionar turnos con una experiencia rápida y profesional.</p>
      <p style="color:${palette.text};font-size:16px;line-height:1.6;">${escapeHtml(ctaIntro)}</p>
      <p style="margin:28px 0;">
        <a href="${escapeAttribute(ctaUrl)}" style="display:inline-block;background:${palette.violetDark};color:${palette.text};padding:14px 20px;border-radius:999px;text-decoration:none;font-weight:700;">${escapeHtml(ctaLabel)}</a>
      </p>
      <p style="color:${palette.muted};font-size:14px;line-height:1.5;">Si necesitás ayuda, estamos en ${escapeHtml(data.supportContact)}.</p>
    `),
  };
}

export function renderTrialUserActivationReminder(data: TrialUserActivationReminderData): TrialUserActivationReminder {
  return {
    to: data.recipientEmail,
    subject: "Tu turnero de Orvel ya está listo",
    html: renderShell("Tu turnero ya está listo", `
      <p style="color:${palette.text};font-size:16px;line-height:1.6;">Gracias por confiar en Orvel para acompañar a ${escapeHtml(data.businessName)}.</p>
      <p style="color:${palette.muted};font-size:16px;line-height:1.6;">Tu turnero ya está listo. Configurá tus horarios para que tus clientes puedan empezar a reservar.</p>
      <p style="margin:28px 0;">
        <a href="${escapeAttribute(data.dashboardUrl)}" style="display:inline-block;background:${palette.violet};color:${palette.text};padding:14px 20px;border-radius:999px;text-decoration:none;font-weight:700;">Configurar mis horarios</a>
      </p>
      <p style="color:${palette.muted};font-size:14px;line-height:1.5;">Después podés copiar y compartir este enlace con tus clientes:</p>
      <p style="color:${palette.text};font-size:14px;line-height:1.5;word-break:break-all;">${escapeHtml(data.bookingUrl)}</p>
    `),
  };
}

function escapeHtml(value: string): string {
  if (!value) return "";
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
