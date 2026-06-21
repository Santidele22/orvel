export interface AppointmentTemplateData {
  customer: { name: string; email: string };
  business: { name: string; address: string };
  service: { name: string };
  date: Date | string;
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

type AppointmentEmailKind = 'confirmation' | 'reminder' | 'cancellation' | 'reschedule' | 'business_notification';

const ORVEL_DARK = '#0A0A0A';
const ORVEL_SURFACE = '#121212';
const ORVEL_TEXT = '#F1F5F9';
const ORVEL_MUTED = '#94A3B8';
const ORVEL_VIOLET = '#7C3AED';
const ORVEL_VIOLET_DARK = '#6D28D9';
const ORVEL_VIOLET_SOFT = '#A78BFA';

export function formatArgentinaAppointmentDate(dateInput: Date | string): string {
  if (!dateInput) return "--/--/----";
  
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  
  if (isNaN(date.getTime())) return "--/--/----";

  const day = `${date.getDate()}`.padStart(2, '0');
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function renderAppointmentConfirmationEmail(data: AppointmentTemplateData): EmailPayload {
  return renderAppointmentEmail(data, 'confirmation', 'Tu turno está confirmado en Orvel');
}

export function renderAppointmentBusinessNotificationEmail(data: AppointmentTemplateData): EmailPayload {
  return renderAppointmentEmail(data, 'business_notification', 'Nuevo turno agendado');
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
  const date = formatArgentinaAppointmentDate(data.date);
  const price = formatPrice(data.price);
  const viewLink = safeAppointmentLink(data.links?.view);
  const cancelLink = safeAppointmentLink(data.links?.cancel);
  const rescheduleLink = safeAppointmentLink(data.links?.reschedule);

  const greeting = kind === 'business_notification' 
    ? `Hola,` 
    : `Hola ${escapeHtml(data.customer.name)},`;

  const introText = kind === 'business_notification'
    ? `${copy.intro} El cliente <strong>${escapeHtml(data.customer.name)}</strong> reservó el siguiente servicio:`
    : copy.intro;

  return {
    subject,
    html: `
      <!doctype html>
      <html lang="es-AR">
        <body style="margin:0;background:${ORVEL_DARK};color:${ORVEL_TEXT};font-family:Arial,sans-serif;">
          <main style="max-width:640px;margin:0 auto;padding:32px;">
            <section style="background:${ORVEL_SURFACE};border-radius:24px;padding:32px;border:1px solid ${ORVEL_VIOLET_DARK};">
              <p style="letter-spacing:.18em;text-transform:uppercase;color:${ORVEL_VIOLET_SOFT};font-size:12px;">Orvel</p>
              <h1 style="font-size:28px;margin:0 0 12px;">${copy.heading}</h1>
              <p>${greeting} ${introText}</p>
              <ul style="line-height:1.8;padding-left:18px;">
                <li><strong>Negocio:</strong> ${escapeHtml(data.business.name)}</li>
                <li><strong>Dirección:</strong> ${escapeHtml(data.business.address)}</li>
                <li><strong>Servicio:</strong> ${escapeHtml(data.service.name)}</li>
                <li><strong>Fecha:</strong> ${date}</li>
                <li><strong>Horario:</strong> ${escapeHtml(data.time)}</li>
                <li><strong>Duración:</strong> ${data.duration} minutos</li>
                <li><strong>Precio:</strong> ${price}</li>
              </ul>
              <p>Si necesitás ayuda, escribinos a ${escapeHtml(data.contact.email)} o llamanos al ${escapeHtml(data.contact.phone)}.</p>
              <p style="margin-top:28px;">
                <a href="${escapeAttribute(viewLink)}" style="background:${ORVEL_VIOLET};color:${ORVEL_TEXT};padding:14px 20px;border-radius:999px;text-decoration:none;">Ver turno</a>
              </p>
              <p style="font-size:14px;color:${ORVEL_MUTED};">
                También podés <a href="${escapeAttribute(cancelLink)}" style="color:#A78BFA;text-decoration:underline;">cancelar</a> o
                <a href="${escapeAttribute(rescheduleLink)}" style="color:#A78BFA;text-decoration:underline;">reprogramar</a> tu turno.
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
      return { heading: 'Turno confirmado', intro: 'te esperamos con todo listo para una experiencia premium y cálida.' };
    case 'reminder':
      return { heading: 'Recordatorio 24 h', intro: 'mañana tenés tu turno. Te esperamos.' };
    case 'cancellation':
      return { heading: 'Turno cancelado', intro: 'registramos la cancelación de tu turno.' };
    case 'reschedule':
      return { heading: 'Turno reprogramado', intro: 'actualizamos tu reserva con un nuevo horario.' };
    case 'business_notification':
      return { heading: 'Nuevo turno agendado', intro: 'se ha agendado un nuevo turno en tu negocio.' };
  }
}

function formatPrice(price: number): string {
  return `$${Math.round(price).toLocaleString('es-AR')}`;
}

function escapeHtml(value: string): string {
  if (!value) return '';
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function safeAppointmentLink(value: string): string {
  if (!value) return '#';
  const trimmed = value.trim();

  try {
    const url = new URL(trimmed);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return url.toString();
    }
  } catch {
    // Fall through to an inert href. Appointment action links must be absolute.
  }

  return '#';
}
