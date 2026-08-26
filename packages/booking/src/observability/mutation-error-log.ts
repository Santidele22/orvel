export type MutationErrorLog = {
  operation: string;
  status?: number;
  code?: string;
  businessId?: string;
  branchId?: string;
  bookingId?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT_RE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MESSAGE_CODE_RE = /\b[A-Z][A-Z0-9_]{1,62}\b/;
const SQLSTATE_RE = /\b\d{5}\b/;
const PROSE_CODE_FRAGMENTS = new Set([
  'NO',
  'SI',
  'YES',
  'OK',
  'ERROR',
  'FAILED',
  'FAIL',
  'FAILURE',
  'SUCCESS',
  'WARNING',
  'INVALID',
  'UNKNOWN',
  'THE',
  'AND',
  'NOT'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeCode(code: unknown): string | undefined {
  if (typeof code !== 'string') return undefined;

  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9_:-]/g, '_').slice(0, 64);
  return normalized || undefined;
}

function sanitizeStatus(status: unknown): number | undefined {
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : undefined;
}

function looksUnsafeId(value: string): boolean {
  return value.includes('@') || JWT_RE.test(value) || /token|jwt|bearer/i.test(value);
}

function sanitizeId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || looksUnsafeId(trimmed) || !UUID_RE.test(trimmed)) return undefined;
  return trimmed;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isScrapedDomainCode(token: string): boolean {
  if (token.length <= 2 || PROSE_CODE_FRAGMENTS.has(token)) return false;
  return token.includes('_') || token === 'UNAUTHORIZED' || /^P\d{4}$/.test(token);
}

function extractCodeFromMessage(message: string): string | undefined {
  const upper = message.toUpperCase();
  const tokens = [...upper.matchAll(new RegExp(MESSAGE_CODE_RE, 'g'))].map((match) => match[0]);
  const domainCode = tokens.find(isScrapedDomainCode);
  if (domainCode) return sanitizeCode(domainCode);
  return sanitizeCode(upper.match(SQLSTATE_RE)?.[0]);
}

function extractCode(error: unknown, response?: { error?: { code?: string; message?: string } }): string | undefined {
  const fromResponse = sanitizeCode(response?.error?.code);
  if (fromResponse) return fromResponse;

  if (isRecord(error)) {
    const fromError = sanitizeCode(error['code']);
    if (fromError) return fromError;
  }

  if (error instanceof Error) {
    const fromMessage = extractCodeFromMessage(error.message);
    if (fromMessage) return fromMessage;
  }

  if (isRecord(error)) {
    const message = readString(error['message']);
    if (message) return extractCodeFromMessage(message);
  }

  return sanitizeCode(response?.error?.message ? extractCodeFromMessage(response.error.message) : undefined);
}

function extractStatus(error: unknown, response?: { status?: number }): number | undefined {
  const fromResponse = sanitizeStatus(response?.status);
  if (fromResponse !== undefined) return fromResponse;

  if (isRecord(error)) {
    return sanitizeStatus(error['status']);
  }

  return undefined;
}

export function logMutationFailure(input: {
  operation: string;
  error?: unknown;
  response?: { status?: number; error?: { code?: string; message?: string } };
  ids?: { businessId?: string; branchId?: string; bookingId?: string };
}): MutationErrorLog {
  const payload: MutationErrorLog = { operation: input.operation };
  const status = extractStatus(input.error, input.response);
  const code = extractCode(input.error, input.response);
  const businessId = sanitizeId(input.ids?.businessId);
  const branchId = sanitizeId(input.ids?.branchId);
  const bookingId = sanitizeId(input.ids?.bookingId);

  if (status !== undefined) payload.status = status;
  if (code) payload.code = code;
  if (businessId) payload.businessId = businessId;
  if (branchId) payload.branchId = branchId;
  if (bookingId) payload.bookingId = bookingId;

  console.error('[Orvel] mutation failed', payload);
  return payload;
}
