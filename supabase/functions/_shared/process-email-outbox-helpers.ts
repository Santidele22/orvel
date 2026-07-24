import * as AppointmentTemplates from "../../../apps/shared/email-templates/appointment-templates.ts";

type AppointmentLinks = {
  view?: string | null;
  cancel?: string | null;
  reschedule?: string | null;
};

const DEFAULT_APPOINTMENT_DURATION_MINUTES = 30;
const ARGENTINA_BUSINESS_TIME_ZONE = "America/Argentina/Buenos_Aires";

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function isTokenBearingString(value: string): boolean {
  return /(?:[?&](?:token|code|access_token|refresh_token)=|\/confirm-email\b|\/auth\/callback\b|\/recovery\b)/i.test(value);
}

function scrubTokenBearingPayloadValue(key: string, value: unknown, sensitiveFields: Set<string>): unknown {
  const lowerKey = key.toLowerCase();
  if (sensitiveFields.has(lowerKey)) return null;
  if (typeof value === "string" && isTokenBearingString(value)) return null;
  if (Array.isArray(value)) return value.map((item) => scrubTokenBearingPayloadValue("", item, sensitiveFields));
  if (isPlainObject(value)) {
    const scrubbed: Record<string, any> = {};
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      scrubbed[nestedKey] = scrubTokenBearingPayloadValue(nestedKey, nestedValue, sensitiveFields);
    }
    return scrubbed;
  }
  return value;
}

export function scrubTokenBearingOutboxPayload(payload: Record<string, any> | undefined): Record<string, any> {
  const sensitiveFields = new Set([
    "confirmation_url",
    "set_password_url",
    "first_login_url",
    "action_link",
    "token",
    "manage_token",
    "access_token",
    "refresh_token",
  ]);
  const scrubbed: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload ?? {})) {
    scrubbed[key] = scrubTokenBearingPayloadValue(key, value, sensitiveFields);
  }
  scrubbed.sensitive_payload_scrubbed_at = new Date().toISOString();
  return scrubbed;
}

function firstNonBlank(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeAppointmentLinks(rawLinks: unknown, baseUrl: string): AppointmentLinks {
  const links = rawLinks && typeof rawLinks === "object" ? rawLinks as Partial<AppointmentLinks> : {};
  const toAbsolute = (value: unknown): string | null => {
    if (typeof value !== "string" || !value.trim() || value.trim() === "#") return null;
    try {
      return new URL(value.trim(), baseUrl).toString();
    } catch {
      return null;
    }
  };

  return {
    view: toAbsolute(links.view),
    cancel: toAbsolute(links.cancel),
    reschedule: toAbsolute(links.reschedule),
  };
}

export function appointmentTimeLabel(startsAt: unknown, fallback: unknown): string {
  const dateInput = typeof startsAt === "string" && startsAt.trim()
    ? startsAt
    : typeof fallback === "string" && fallback.trim()
      ? fallback
      : null;
  if (!dateInput) return "--:--";
  const date = new Date(dateInput);
  if (!Number.isFinite(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ARGENTINA_BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function normalizeAppointmentTemplateData(fullData: Record<string, any>, toEmail: string, fromEmail: string, baseUrl: string): AppointmentTemplates.AppointmentTemplateData {
  const startsAt = firstNonBlank(fullData.date, fullData.starts_at) ?? new Date().toISOString();
  return {
    ...fullData,
    customer: {
      name: firstNonBlank(fullData.customer?.name, fullData.customer_name) ?? "Cliente",
      email: firstNonBlank(fullData.customer?.email) ?? toEmail,
    },
    business: {
      name: firstNonBlank(fullData.business?.name, fullData.business_name) ?? "Orvel",
      address: firstNonBlank(fullData.business?.address, fullData.branch_address, fullData.business_address) ?? "Consultar dirección",
    },
    service: {
      name: firstNonBlank(fullData.service?.name, fullData.service_name) ?? "Servicio",
    },
    date: startsAt,
    time: firstNonBlank(fullData.time) ?? appointmentTimeLabel(startsAt, fullData.starts_at),
    duration: finiteNumber(fullData.duration) ?? finiteNumber(fullData.duration_minutes) ?? DEFAULT_APPOINTMENT_DURATION_MINUTES,
    price: finiteNumber(fullData.price) ?? finiteNumber(fullData.price_at_booking) ?? 0,
    contact: {
      phone: firstNonBlank(fullData.contact?.phone, fullData.business_phone) ?? "No especificado",
      email: firstNonBlank(fullData.contact?.email, fullData.business_support_email) ?? fromEmail,
    },
    links: normalizeAppointmentLinks(fullData.links, baseUrl),
  };
}
