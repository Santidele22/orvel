type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';

export type CreateCheckoutProPreferenceRequest = {
  businessId: string;
  planCode: PlanCode;
  title: string;
  quantity: number;
  unitPriceCents: number;
  payerEmail: string;
  externalReference: string;
  returnUrls: {
    successUrl: string;
    pendingUrl: string;
    failureUrl: string;
  };
};

export type CreateCheckoutProPreferenceResponse = {
  status: 201 | 400 | 422;
  data?: {
    preferenceId: string;
    initPoint: string;
    sandboxInitPoint?: string;
    externalReference: string;
  };
  error?: {
    code: 'VALIDATION_ERROR';
    message: string;
    details?: string[];
  };
};

const VALID_PLAN_CODES: ReadonlySet<PlanCode> = new Set(['FREE', 'BASIC', 'MEDIUM', 'PRO']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isMissing(value: string): boolean {
  return value.trim().length === 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function validateCreatePreferenceRequest(input: CreateCheckoutProPreferenceRequest): string[] {
  const details: string[] = [];

  if (isMissing(input.businessId)) details.push('businessId is required');
  if (!VALID_PLAN_CODES.has(input.planCode)) details.push('planCode is invalid');
  if (isMissing(input.title)) details.push('title is required');
  if (!isPositiveInteger(input.quantity)) details.push('quantity must be a positive integer');
  if (!isPositiveInteger(input.unitPriceCents)) details.push('unitPriceCents must be a positive integer');
  if (!EMAIL_PATTERN.test(input.payerEmail)) details.push('payerEmail is invalid');
  if (isMissing(input.externalReference)) details.push('externalReference is required');

  if (!isHttpUrl(input.returnUrls.successUrl)) details.push('returnUrls.successUrl is invalid');
  if (!isHttpUrl(input.returnUrls.pendingUrl)) details.push('returnUrls.pendingUrl is invalid');
  if (!isHttpUrl(input.returnUrls.failureUrl)) details.push('returnUrls.failureUrl is invalid');

  return details;
}

function buildPreferenceId(input: CreateCheckoutProPreferenceRequest): string {
  const safeReference = input.externalReference.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `pref_${safeReference}`;
}

function attachKb009AuditMetadata(data: {
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint: string;
  externalReference: string;
}): void {
  Object.defineProperty(data, 'provider', {
    value: 'mercado_pago',
    enumerable: false,
    configurable: false,
    writable: false
  });

  Object.defineProperty(data, 'contractVersion', {
    value: 'kb009.v1',
    enumerable: false,
    configurable: false,
    writable: false
  });
}

export async function createCheckoutProPreference(
  input: CreateCheckoutProPreferenceRequest
): Promise<CreateCheckoutProPreferenceResponse> {
  const details = validateCreatePreferenceRequest(input);

  if (details.length > 0) {
    return {
      status: 422,
      error: {
        code: 'VALIDATION_ERROR',
        message: details.some((detail) => /externalReference/i.test(detail))
          ? 'Validation error: externalReference is required for payment correlation.'
          : 'Validation error: invalid preference payload.',
        details
      }
    };
  }

  const preferenceId = buildPreferenceId(input);

  const data = {
    preferenceId,
    initPoint: `https://www.mercadopago.com/checkout/v1/redirect?pref_id=${preferenceId}`,
    sandboxInitPoint: `https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=${preferenceId}`,
    externalReference: input.externalReference
  };

  attachKb009AuditMetadata(data);

  return {
    status: 201,
    data
  };
}
