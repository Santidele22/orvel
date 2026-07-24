import type { AppointmentTemplateData, EmailPayload } from './appointment-template.types';

// ── Palette ──────────────────────────────────────────
const PALETTE = {
  black: '#0A0A0A',
  panel: '#121212',
  text: '#F1F5F9',
  muted: '#94A3B8',
  violet: '#7C3AED',
  violetDark: '#6D28D9',
  violetSoft: '#A78BFA',
} as const;

const ARGENTINA_TZ = 'America/Argentina/Buenos_Aires';

// ── Date formatting ────────────────────────────────

export function formatArgentinaAppointmentDate(dateInput: Date | string): string {
  if (!dateInput) return '--/--/----';

  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;

  if (Number.isNaN(date.getTime())) return '--/--/----';

  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: ARGENTINA_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);

  const day = parts.find((p) => p.type === 'day')?.value ?? '--';
  const month = parts.find((p) => p.type === 'month')?.value ?? '--';
  const year = parts.find((p) => p.type === 'year')?.value ?? '----';
  return `${day}/${month}/${year}`;
}

// ── Email kind ─────────────────────────────────────

type AppointmentEmailKind =
  | 'confirmation'
  | 'reminder'
  | 'cancellation'
  | 'reschedule'
  | 'business_notification'
  | 'business_cancellation';

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
    case 'business_cancellation':
      return { heading: 'Turno cancelado', intro: 'se ha cancelado un turno en tu negocio.' };
  }
}

// ── Format helpers ─────────────────────────────────

function formatPrice(price: number): string {
  if (!Number.isFinite(price)) return '$0';
  return `$${Math.round(price).toLocaleString('es-AR')}`;
}

function formatDuration(duration: number): string {
  if (!Number.isFinite(duration) || duration <= 0) return '30 minutos';
  return `${Math.round(duration)} minutos`;
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

function safeAbsoluteUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '#') return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return url.toString();
    }
  } catch {
    /* not an absolute URL */
  }

  return null;
}

function joinSpanishActions(actions: string[]): string {
  if (actions.length === 1) return actions[0];
  return `${actions.slice(0, -1).join(', ')} o ${actions.at(-1)}`;
}

function renderSecondaryActions(cancelLink: string | null, rescheduleLink: string | null): string {
  const actions: string[] = [];
  if (cancelLink) {
    actions.push(`<a href="${escapeAttribute(cancelLink)}" style="color:#A78BFA;text-decoration:underline;">cancelar</a>`);
  }
  if (rescheduleLink) {
    actions.push(`<a href="${escapeAttribute(rescheduleLink)}" style="color:#A78BFA;text-decoration:underline;">reprogramar</a>`);
  }

  if (actions.length === 0) return '';

  return `<p style="font-size:14px;color:${PALETTE.muted};">También podés ${joinSpanishActions(actions)} tu turno.</p>`;
}

// ── Shared render shell ────────────────────────────

function htmlShell(heading: string, greeting: string, introHtml: string, detailItems: string, footerHtml: string, viewActionHtml: string, secondaryActionsHtml: string): string {
  return `
      <!doctype html>
      <html lang="es-AR">
        <body style="margin:0;background:${PALETTE.black};color:${PALETTE.text};font-family:Arial,sans-serif;">
          <main style="max-width:640px;margin:0 auto;padding:32px;">
            <section style="background:${PALETTE.panel};border-radius:24px;padding:32px;border:1px solid ${PALETTE.violetDark};box-shadow:0 24px 80px rgba(124,58,237,.24);">
              <p style="letter-spacing:.18em;text-transform:uppercase;color:${PALETTE.violetSoft};font-size:12px;">Orvel</p>
              <h1 style="font-size:28px;margin:0 0 12px;color:${PALETTE.text};">${heading}</h1>
              <p>${greeting} ${introHtml}</p>
              ${detailItems ? `<ul style="line-height:1.8;padding-left:18px;">${detailItems}</ul>` : ''}
              ${footerHtml}
              ${viewActionHtml}
              ${secondaryActionsHtml}
            </section>
          </main>
        </body>
      </html>`;
}

// ── Render implementations ─────────────────────────

export function renderAppointmentConfirmationEmail(data: AppointmentTemplateData): EmailPayload {
  const viewLink = safeAbsoluteUrl(data.links?.view);

  return {
    subject: 'Turno confirmado',
    html: htmlShell(
      'Turno confirmado',
      `Hola ${escapeHtml(data.customer.name)},`,
      'gracias por confiar en nosotros.',
      renderDetailItems(data),
      '',
      viewLink
        ? `<p style="margin-top:28px;">
                <a href="${escapeAttribute(viewLink)}" style="background:${PALETTE.violet};color:${PALETTE.text};padding:14px 20px;border-radius:999px;text-decoration:none;">Ver y gestionar turno</a>
              </p>`
        : '',
      '',
    ),
  };
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

export function renderAppointmentBusinessNotificationEmail(data: AppointmentTemplateData): EmailPayload {
  return renderAppointmentEmail(data, 'business_notification', 'Nuevo turno agendado');
}

export function renderAppointmentBusinessCancellationEmail(data: AppointmentTemplateData): EmailPayload {
  return renderAppointmentEmail(data, 'business_cancellation', 'Turno cancelado');
}

// ── Generic render ─────────────────────────────────

function renderAppointmentEmail(data: AppointmentTemplateData, kind: AppointmentEmailKind, subject: string): EmailPayload {
  const copy = copyFor(kind);
  const date = formatArgentinaAppointmentDate(data.date);
  const price = formatPrice(data.price);
  const duration = formatDuration(data.duration);

  const isBusinessRecipient = kind === 'business_notification' || kind === 'business_cancellation';
  const canRenderSelfServiceLinks = !isBusinessRecipient;

  const viewLink = canRenderSelfServiceLinks ? safeAbsoluteUrl(data.links?.view) : null;
  const cancelLink = canRenderSelfServiceLinks ? safeAbsoluteUrl(data.links?.cancel) : null;
  const rescheduleLink = canRenderSelfServiceLinks ? safeAbsoluteUrl(data.links?.reschedule) : null;

  const greeting: string = isBusinessRecipient
    ? 'Hola,'
    : `Hola ${escapeHtml(data.customer.name)},`;

  const introHtml: string = isBusinessRecipient
    ? `${copy.intro} Cliente: <strong>${escapeHtml(data.customer.name)}</strong>. Detalle del turno:`
    : copy.intro;

  const footerHtml = `<p>Si necesitás ayuda, escribinos a ${escapeHtml(data.contact.email)} o llamanos al ${escapeHtml(data.contact.phone)}.</p>`;

  const viewActionHtml = viewLink
    ? `<p style="margin-top:28px;">
                <a href="${escapeAttribute(viewLink)}" style="background:${PALETTE.violet};color:${PALETTE.text};padding:14px 20px;border-radius:999px;text-decoration:none;">Ver turno</a>
              </p>`
    : '';

  const secondaryActionsHtml = renderSecondaryActions(cancelLink, rescheduleLink);

  return {
    subject,
    html: htmlShell(
      copy.heading,
      greeting,
      introHtml,
      renderDetailItems(data, date, price, duration),
      footerHtml,
      viewActionHtml,
      secondaryActionsHtml,
    ),
  };
}

function renderDetailItems(data: AppointmentTemplateData, date?: string, price?: string, duration?: string): string {
  return `
                <li><strong>Negocio:</strong> ${escapeHtml(data.business.name)}</li>
                <li><strong>Dirección:</strong> ${escapeHtml(data.business.address)}</li>
                <li><strong>Servicio:</strong> ${escapeHtml(data.service.name)}</li>
                <li><strong>Fecha:</strong> ${date ?? formatArgentinaAppointmentDate(data.date)}</li>
                <li><strong>Horario:</strong> ${escapeHtml(data.time)}</li>
                <li><strong>Duración:</strong> ${duration ?? formatDuration(data.duration)}</li>
                <li><strong>Precio:</strong> ${price ?? formatPrice(data.price)}</li>`;
}
