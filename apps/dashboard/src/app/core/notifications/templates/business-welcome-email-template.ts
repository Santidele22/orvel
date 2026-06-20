export interface BusinessWelcomeEmailData {
  business: { name: string; ownerName: string };
  dashboardUrl: string;
  supportContact: string;
}

export function renderBusinessWelcomeEmail(data: BusinessWelcomeEmailData): { subject: string; html: string } {
  const dashboardUrl = safeAbsoluteHttpUrl(data.dashboardUrl);

  return {
    subject: `Bienvenida a Orvel, ${data.business.name}`,
    html: `
      <!doctype html>
      <html lang="es-AR">
        <body style="margin:0;background:#f6efe7;color:#30251d;font-family:Arial,sans-serif;">
          <main style="max-width:640px;margin:0 auto;padding:32px;">
            <section style="background:#fffaf5;border:1px solid #ead8c7;border-radius:24px;padding:32px;">
              <p style="letter-spacing:.18em;text-transform:uppercase;color:#9a6b43;font-size:12px;">Orvel</p>
              <h1 style="margin:0 0 16px;font-size:30px;">Bienvenida, ${escapeHtml(data.business.ownerName)}</h1>
              <p>${escapeHtml(data.business.name)} ya tiene su espacio listo para gestionar turnos con Orvel.</p>
              <p style="margin:28px 0;">
                <a href="${escapeAttribute(dashboardUrl)}" style="background:#8a5a36;color:#fff;padding:14px 20px;border-radius:999px;text-decoration:none;">Entrar al dashboard</a>
              </p>
              <p>Si necesitás ayuda, estamos en ${escapeHtml(data.supportContact)}.</p>
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
