const JWT_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

export const SUBSCRIPTION_RECOVERY_ERRORS = {
  pending_signup_missing: 'No encontramos los datos protegidos de tu alta paga. Volvé al formulario para recuperar el intento y reintentá el pago.',
} as const;

type BillingPeriod = 'monthly';
type SubscriptionPlan = 'FREE' | 'PREMIUM' | string;
const LEGACY_PAID_PLAN_ALIASES = new Set(['STARTER', 'STARTED', 'BASIC', 'MEDIUM', 'GROWTH', 'PRO', 'SIMPLE', 'CRECE', 'ESCALA']);

export type PendingSignupIntentLike = Record<string, unknown> | null | undefined;
export type PendingSignupReferenceLike = string | null | undefined;

export type SubscriptionStartReadiness =
  | { ok: true; mode: 'free' | 'pending_signup_intent' | 'existing_user' }
  | { ok: false; code: keyof typeof SUBSCRIPTION_RECOVERY_ERRORS; message: string; recoveryHref: string };

export type InitialSubscriptionPageRecovery = {
  code: keyof typeof SUBSCRIPTION_RECOVERY_ERRORS;
  message: string;
  recoveryHref: string;
} | null;

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export function normalizeSubscriptionBilling(rawBilling?: string | null): BillingPeriod {
  const normalized = rawBilling?.trim().toLowerCase();
  return normalized === 'monthly' ? normalized : 'monthly';
}

export function normalizeSubscriptionPlan(rawPlan: SubscriptionPlan): 'FREE' | 'PREMIUM' {
  const normalizedPlan = typeof rawPlan === 'string' && rawPlan.trim() ? rawPlan.trim().toUpperCase() : 'PREMIUM';
  if (normalizedPlan === 'FREE') return 'FREE';
  if (normalizedPlan === 'PREMIUM' || LEGACY_PAID_PLAN_ALIASES.has(normalizedPlan)) return 'PREMIUM';
  return 'FREE';
}

export function isJwtShapedAccessToken(value: unknown): value is string {
  const token = asNonEmptyString(value);
  if (!token) return false;
  const segments = token.split('.');
  return segments.length === 3 && segments.every((segment) => JWT_SEGMENT_PATTERN.test(segment));
}

export function hasProtectedPendingSignupIntent(intent: PendingSignupIntentLike): intent is Record<string, unknown> {
  return !!intent
    && typeof intent === 'object'
    && !!asNonEmptyString(intent.email_encrypted)
    && !!asNonEmptyString(intent.email_hmac);
}

export function buildPendingSignupRecoveryHref(plan: SubscriptionPlan, billing?: string | null): string {
  const normalizedPlan = normalizeSubscriptionPlan(plan);
  const normalizedBilling = normalizeSubscriptionBilling(billing);
  return `/auth/signup/credentials?plan=${encodeURIComponent(normalizedPlan)}&billing=${encodeURIComponent(normalizedBilling)}&resume=credentials_first`;
}

export function getInitialSubscriptionPageRecovery({
  plan,
  billing,
  signupIntent,
  pendingSignupIntent,
  pendingSignupReference,
}: {
  plan: SubscriptionPlan;
  billing?: string | null;
  signupIntent?: string | null;
  pendingSignupIntent: PendingSignupIntentLike;
  pendingSignupReference?: PendingSignupReferenceLike;
}): InitialSubscriptionPageRecovery {
  const normalizedPlan = normalizeSubscriptionPlan(plan);
  const normalizedSignupIntent = signupIntent?.trim().toLowerCase();

  if (normalizedPlan === 'FREE') return null;
  if (normalizedSignupIntent !== 'pending_signup') return null;
  if (asNonEmptyString(pendingSignupReference)) return null;
  if (hasProtectedPendingSignupIntent(pendingSignupIntent)) return null;

  return {
    code: 'pending_signup_missing',
    message: SUBSCRIPTION_RECOVERY_ERRORS.pending_signup_missing,
    recoveryHref: buildPendingSignupRecoveryHref(normalizedPlan || 'PREMIUM', billing),
  };
}

export function getSubscriptionStartReadiness({
  plan,
  billing,
  pendingSignupIntent,
  pendingSignupReference,
  accessToken,
}: {
  plan: SubscriptionPlan;
  billing?: string | null;
  pendingSignupIntent: PendingSignupIntentLike;
  pendingSignupReference?: PendingSignupReferenceLike;
  accessToken: unknown;
}): SubscriptionStartReadiness {
  const normalizedPlan = normalizeSubscriptionPlan(plan);
  if (normalizedPlan === 'FREE') return { ok: true, mode: 'free' };
  if (asNonEmptyString(pendingSignupReference)) return { ok: true, mode: 'pending_signup_intent' };
  if (hasProtectedPendingSignupIntent(pendingSignupIntent)) return { ok: true, mode: 'pending_signup_intent' };
  if (isJwtShapedAccessToken(accessToken)) return { ok: true, mode: 'existing_user' };

  return {
    ok: false,
    code: 'pending_signup_missing',
    message: SUBSCRIPTION_RECOVERY_ERRORS.pending_signup_missing,
    recoveryHref: buildPendingSignupRecoveryHref(normalizedPlan || 'PREMIUM', billing),
  };
}

export function buildPendingSignupIntentPayload(intent: PendingSignupIntentLike): Record<string, unknown> | null {
  if (!hasProtectedPendingSignupIntent(intent)) return null;

  return {
    email_encrypted: intent.email_encrypted,
    email_hmac: intent.email_hmac,
    first_name_encrypted: intent.first_name_encrypted,
    first_name_hmac: intent.first_name_hmac,
    last_name_encrypted: intent.last_name_encrypted,
    last_name_hmac: intent.last_name_hmac,
    phone_encrypted: intent.phone_encrypted,
    phone_hmac: intent.phone_hmac,
    business_name_encrypted: intent.business_name_encrypted,
    business_name_hmac: intent.business_name_hmac,
    pii_crypto_version: intent.pii_crypto_version,
    plan_code: intent.plan_code,
    billing_period: intent.billing_period,
    business_type: intent.business_type,
    selected_business_types: intent.selected_business_types,
  };
}
