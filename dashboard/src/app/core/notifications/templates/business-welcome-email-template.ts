export interface BusinessWelcomeEmailData {
  business: { name: string; ownerName: string };
  dashboardUrl: string;
  supportContact: string;
}

const ORVEL_EMAIL_PALETTE = {
  black: '#0A0A0A',
  panel: '#121212',
  text: '#F1F5F9',
  muted: '#94A3B8',
  violet: '#7C3AED',
  violetDark: '#6D28D9',
  violetSoft: '#A78BFA',
};

export function renderBusinessWelcomeEmail(data: BusinessWelcomeEmailData): { subject: string; html: string } {
  const dashboardUrl = safeAbsoluteHttpUrl(data.dashboardUrl);

  return {
    subject: `Bienvenida a Orvel, ${data.business.name}`,
    html: `
      <!doctype html>
      <html lang="es-AR">
        <body style="margin:0;background:${ORVEL_EMAIL_PALETTE.black};color:${ORVEL_EMAIL_PALETTE.text};font-family:Arial,sans-serif;">
          <main style="max-width:640px;margin:0 auto;padding:32px;">
            <section style="background:${ORVEL_EMAIL_PALETTE.panel};border:1px solid ${ORVEL_EMAIL_PALETTE.violetDark};border-radius:24px;padding:32px;box-shadow:0 24px 80px rgba(124,58,237,.24);">
              <p style="letter-spacing:.18em;text-transform:uppercase;color:${ORVEL_EMAIL_PALETTE.violetSoft};font-size:12px;">Orvel</p>
              <h1 style="margin:0 0 16px;font-size:30px;color:${ORVEL_EMAIL_PALETTE.text};">Bienvenida, ${escapeHtml(data.business.ownerName)}</h1>
              <p style="color:${ORVEL_EMAIL_PALETTE.muted};">${escapeHtml(data.business.name)} ya tiene su espacio listo para gestionar turnos con Orvel.</p>
              <p style="margin:28px 0;">
                <a href="${escapeAttribute(dashboardUrl)}" style="background:${ORVEL_EMAIL_PALETTE.violet};color:${ORVEL_EMAIL_PALETTE.text};padding:14px 20px;border-radius:999px;text-decoration:none;">Entrar al dashboard</a>
              </p>
              <p style="color:${ORVEL_EMAIL_PALETTE.muted};">Si necesitás ayuda, estamos en ${escapeHtml(data.supportContact)}.</p>
            </section>
          </main>
        </body>
      </html>
    `,
  };
}

function safeAbsoluteHttpUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '#';
  } catch {
    return '#';
  }
}

function escapeHtml(value: string): string {
  return (value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
