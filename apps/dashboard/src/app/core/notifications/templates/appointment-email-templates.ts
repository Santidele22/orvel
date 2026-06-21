export interface AppointmentTemplateData {
  customer: { name: string; email: string };
  business: { name: string; address: string };
  service: { name: string };
  date: Date;
  time: string;
  duration: number;
  price: number;
  contact: { phone: string; email: string };
  links: { view: string; cancel: string; reschedule: string };
}

export interface EmailPayload {
  subject: string;
  html: string;
}

type AppointmentEmailKind = 'confirmation' | 'reminder' | 'cancellation' | 'reschedule';

const ORVEL_EMAIL_PALETTE = {
  black: '#0A0A0A',
  panel: '#121212',
  text: '#F1F5F9',
  muted: '#94A3B8',
  violet: '#7C3AED',
  violetDark: '#6D28D9',
  violetSoft: '#A78BFA',
};

export function formatArgentinaAppointmentDate(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '--/--/----';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

export function renderAppointmentConfirmationEmail(data: AppointmentTemplateData): EmailPayload {
  return renderAppointmentEmail(data, 'confirmation', 'Confirmación de tu turno en Orvel');
}

export function renderAppointmentReminder24hEmail(data: AppointmentTemplateData): EmailPayload {
  return renderAppointmentEmail(data, 'reminder', 'Recordatorio 24 h de tu turno');
}

export function renderAppointmentCancellationEmail(data: AppointmentTemplateData): EmailPayload {
  return renderAppointmentEmail(data, 'cancellation', 'Tu turno fue cancelado');
}

export function renderAppointmentRescheduleEmail(data: AppointmentTemplateData): EmailPayload {
  return renderAppointmentEmail(data, 'reschedule', 'Tu turno fue reprogramado');
}

function renderAppointmentEmail(
  data: AppointmentTemplateData,
  kind: AppointmentEmailKind,
  subject: string,
): EmailPayload {
  const copy = copyFor(kind);
  const viewLink = safeAbsoluteHttpUrl(data.links.view);
  const cancelLink = safeAbsoluteHttpUrl(data.links.cancel);
  const rescheduleLink = safeAbsoluteHttpUrl(data.links.reschedule);

  return {
    subject,
    html: `
      <!doctype html>
      <html lang="es-AR">
        <body style="margin:0;background:${ORVEL_EMAIL_PALETTE.black};color:${ORVEL_EMAIL_PALETTE.text};font-family:Arial,sans-serif;">
          <main style="max-width:640px;margin:0 auto;padding:32px;">
            <section style="background:${ORVEL_EMAIL_PALETTE.panel};border-radius:24px;padding:32px;border:1px solid ${ORVEL_EMAIL_PALETTE.violetDark};box-shadow:0 24px 80px rgba(124,58,237,.24);">
              <p style="letter-spacing:.18em;text-transform:uppercase;color:${ORVEL_EMAIL_PALETTE.violetSoft};font-size:12px;">Orvel</p>
              <h1 style="font-size:28px;margin:0 0 12px;color:${ORVEL_EMAIL_PALETTE.text};">${copy.heading}</h1>
              <p>Hola ${escapeHtml(data.customer.name)}, ${copy.intro}</p>
              <ul style="line-height:1.8;padding-left:18px;">
                <li><strong>Negocio:</strong> ${escapeHtml(data.business.name)}</li>
                <li><strong>Dirección:</strong> ${escapeHtml(data.business.address)}</li>
                <li><strong>Servicio:</strong> ${escapeHtml(data.service.name)}</li>
                <li><strong>Fecha:</strong> ${formatArgentinaAppointmentDate(data.date)}</li>
                <li><strong>Horario:</strong> ${escapeHtml(data.time)}</li>
                <li><strong>Duración:</strong> ${data.duration} minutos</li>
                <li><strong>Precio:</strong> ${formatPrice(data.price)}</li>
              </ul>
              <p>Si necesitás ayuda, escribinos a ${escapeHtml(data.contact.email)} o llamanos al ${escapeHtml(data.contact.phone)}.</p>
              <p style="margin-top:28px;">
                <a href="${escapeAttribute(viewLink)}" style="background:${ORVEL_EMAIL_PALETTE.violet};color:${ORVEL_EMAIL_PALETTE.text};padding:14px 20px;border-radius:999px;text-decoration:none;">Ver turno</a>
              </p>
              <p style="font-size:14px;color:${ORVEL_EMAIL_PALETTE.muted};">
                También podés <a href="${escapeAttribute(cancelLink)}">cancelar</a> o
                <a href="${escapeAttribute(rescheduleLink)}">reprogramar</a> tu turno.
              </p>
            </section>
          </main>
        </body>
      </html>
    `,
  };
}

function copyFor(kind: AppointmentEmailKind): { heading: string; intro: string } {
  switch (kind) {
    case 'confirmation':
      return { heading: 'Turno confirmado', intro: 'tu reserva está confirmada.' };
    case 'reminder':
      return { heading: 'Recordatorio 24 h', intro: 'mañana tenés tu turno. Te esperamos.' };
    case 'cancellation':
      return { heading: 'Turno cancelado', intro: 'registramos la cancelación de tu turno.' };
    case 'reschedule':
      return { heading: 'Turno reprogramado', intro: 'actualizamos tu reserva con un nuevo horario.' };
  }
}

function formatPrice(price: number): string {
  return `$${Math.round(price).toLocaleString('es-AR')}`;
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
