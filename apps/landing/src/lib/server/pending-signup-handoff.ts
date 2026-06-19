import { createClient } from '@supabase/supabase-js';

import { protectPendingSignupPii } from './pending-signup-pii-protection';

const HANDOFF_COOKIE_NAMES = ['__Host-orvel_paid_signup_handoff', 'orvel_paid_signup_handoff'] as const;
const HANDOFF_MAX_AGE_SECONDS = 30 * 60;

type BillingPeriod = 'monthly' | 'quarterly' | 'annual';
type SignupPlan = 'STARTER' | 'GROWTH' | 'PRO';
type PendingSignupStatus = 'created' | 'provider_created' | 'approved' | 'materializing' | 'materialized' | 'failed' | 'expired';

type HandoffInput = {
  email: unknown;
  first_name: unknown;
  last_name: unknown;
  business_name: unknown;
  phone: unknown;
  business_type: unknown;
  plan_code: unknown;
  billing_period: unknown;
};

export type PendingSignupHandoff = {
  pendingSignupReference: string;
  redirectUrl: string;
  setCookie: string;
};

export type ResolvedPendingSignupHandoff = {
  pendingSignupReference: string;
  pendingSignupIntent: Record<string, unknown>;
};

type PendingSignupWritePayload = {
  email_encrypted?: string | null;
  email_hmac?: string | null;
  first_name_encrypted?: string | null;
  first_name_hmac?: string | null;
  last_name_encrypted?: string | null;
  last_name_hmac?: string | null;
  business_name_encrypted?: string | null;
  business_name_hmac?: string | null;
  phone_encrypted?: string | null;
  phone_hmac?: string | null;
  pii_crypto_version?: string | null;
  business_type: string;
  selected_business_types: string[];
  plan_code: SignupPlan;
  billing_period: BillingPeriod;
  status: PendingSignupStatus;
  provider: 'mercado_pago';
  handoff_reference: string;
  handoff_binding_hash: string;
  handoff_created_at: string;
  expires_at: string;
};

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\r\n\t]+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizePlan(value: unknown): SignupPlan | null {
  const normalized = cleanText(value, 32)?.toUpperCase();
  if (normalized === 'BASIC' || normalized === 'STARTED') return 'STARTER';
  if (normalized === 'MEDIUM') return 'GROWTH';
  return normalized === 'STARTER' || normalized === 'GROWTH' || normalized === 'PRO' ? normalized : null;
}

function normalizeBillingPeriod(value: unknown): BillingPeriod {
  const normalized = cleanText(value, 32)?.toLowerCase();
  return normalized === 'quarterly' || normalized === 'annual' ? normalized : 'monthly';
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createOpaqueToken(prefix: string): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${prefix}_${bytesToBase64Url(bytes)}`;
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isPendingSignupEmailHmacUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; constraint?: unknown; message?: unknown; details?: unknown };
  const combined = `${candidate.constraint ?? ''} ${candidate.message ?? ''} ${candidate.details ?? ''}`;
  return candidate.code === '23505' && /pending_signup_intents_email_hmac_unique_idx|email_hmac/i.test(combined);
}

function getSupabaseAdmin() {
  const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('pending_signup_handoff_config_missing');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function findAuthUserByEmail(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users ?? [];
    const matchingUser = users.find((user) => typeof user.email === 'string' && user.email.trim().toLowerCase() === normalizedEmail);
    if (matchingUser) return matchingUser;
    if (users.length < 1000) return null;
  }
  throw new Error('duplicate_email_lookup_page_limit');
}

function getCookieValue(request: Request, names = HANDOFF_COOKIE_NAMES): string | null {
  const cookieHeader = request.headers.get('cookie') || '';
  for (const cookie of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = cookie.trim().split('=');
    if (names.includes(rawName as typeof HANDOFF_COOKIE_NAMES[number])) return decodeURIComponent(rawValue.join('='));
  }
  return null;
}

function buildSetCookie(request: Request, binding: string): string {
  const url = new URL(request.url);
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.local');
  const secure = url.protocol === 'https:' && !isLocalhost;
  const cookieName = secure ? '__Host-orvel_paid_signup_handoff' : 'orvel_paid_signup_handoff';
  return `${cookieName}=${encodeURIComponent(binding)}; Path=/; Max-Age=${HANDOFF_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function buildPendingSignupWritePayload(params: {
  protectedFields: Awaited<ReturnType<typeof protectPendingSignupPii>>;
  businessType: string;
  planCode: SignupPlan;
  billingPeriod: BillingPeriod;
  pendingSignupReference: string;
  browserBindingHash: string;
  now: Date;
}): PendingSignupWritePayload {
  return {
    ...params.protectedFields,
    business_type: params.businessType,
    selected_business_types: [params.businessType],
    plan_code: params.planCode,
    billing_period: params.billingPeriod,
    status: 'created',
    provider: 'mercado_pago',
    handoff_reference: params.pendingSignupReference,
    handoff_binding_hash: params.browserBindingHash,
    handoff_created_at: params.now.toISOString(),
    expires_at: new Date(params.now.getTime() + HANDOFF_MAX_AGE_SECONDS * 1000).toISOString(),
  };
}

async function reuseStalePendingSignupHandoff(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  emailHmac: string,
  payload: PendingSignupWritePayload,
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const existing = await supabaseAdmin
    .from('pending_signup_intents')
    .select('id,status,expires_at')
    .eq('email_hmac', emailHmac)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) return false;

  const status = typeof existing.data.status === 'string' ? existing.data.status : '';
  const expiresAt = typeof existing.data.expires_at === 'string' ? existing.data.expires_at : '';
  const isReusableStaleIntent = status === 'expired' || status === 'failed' ||
    ((status === 'created' || status === 'provider_created') && Boolean(expiresAt) && expiresAt <= nowIso);
  if (!isReusableStaleIntent) throw new Error('PENDING_SIGNUP_ALREADY_EXISTS');

  const update = await supabaseAdmin
    .from('pending_signup_intents')
    .update(payload)
    .eq('id', existing.data.id);
  if (update.error) throw update.error;
  return true;
}

export async function createPendingSignupHandoff(request: Request, input: HandoffInput): Promise<PendingSignupHandoff> {
  const email = cleanText(input.email, 320)?.toLowerCase();
  const planCode = normalizePlan(input.plan_code);
  const billingPeriod = normalizeBillingPeriod(input.billing_period);
  const businessType = cleanText(input.business_type, 80)?.toLowerCase();
  if (!email || !planCode || !businessType) throw new Error('pending_signup_required_fields');

  const supabaseAdmin = getSupabaseAdmin();
  const duplicateUser = await findAuthUserByEmail(supabaseAdmin, email);
  if (duplicateUser) throw new Error('EMAIL_ALREADY_REGISTERED');

  const protectedFields = await protectPendingSignupPii({
    email,
    first_name: input.first_name,
    last_name: input.last_name,
    business_name: input.business_name,
    phone: input.phone,
  });
  if (!protectedFields.email_encrypted || !protectedFields.email_hmac) throw new Error('pending_signup_email_required');

  const now = new Date();
  const duplicatePending = await supabaseAdmin
    .from('pending_signup_intents')
    .select('id')
    .eq('email_hmac', protectedFields.email_hmac)
    .in('status', ['created', 'provider_created', 'approved', 'materializing'])
    .gt('expires_at', now.toISOString())
    .limit(1)
    .maybeSingle();
  if (duplicatePending.data) throw new Error('PENDING_SIGNUP_ALREADY_EXISTS');
  if (duplicatePending.error) throw duplicatePending.error;

  const pendingSignupReference = createOpaqueToken('psh');
  const browserBinding = createOpaqueToken('psb');
  const payload = buildPendingSignupWritePayload({
    protectedFields,
    businessType,
    planCode,
    billingPeriod,
    pendingSignupReference,
    browserBindingHash: await sha256Text(browserBinding),
    now,
  });

  const staleIntentReused = await reuseStalePendingSignupHandoff(supabaseAdmin, protectedFields.email_hmac, payload);
  if (!staleIntentReused) {
    const { error } = await supabaseAdmin.from('pending_signup_intents').insert(payload);
    if (isPendingSignupEmailHmacUniqueViolation(error)) throw new Error('PENDING_SIGNUP_ALREADY_EXISTS');
    if (error) throw error;
  }

  const redirectUrl = `/billing/subscription?plan=${encodeURIComponent(planCode)}&billing=${encodeURIComponent(billingPeriod)}&signup_intent=pending_signup&pending_signup_reference=${encodeURIComponent(pendingSignupReference)}`;
  return { pendingSignupReference, redirectUrl, setCookie: buildSetCookie(request, browserBinding) };
}

export async function resolvePendingSignupHandoff(request: Request, pendingSignupReference: unknown): Promise<ResolvedPendingSignupHandoff | null> {
  const reference = cleanText(pendingSignupReference, 160);
  if (!reference || !/^psh_[A-Za-z0-9_-]{32,}$/.test(reference)) return null;

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('pending_signup_intents')
    .select('email_encrypted,email_hmac,first_name_encrypted,first_name_hmac,last_name_encrypted,last_name_hmac,phone_encrypted,phone_hmac,business_name_encrypted,business_name_hmac,pii_crypto_version,plan_code,billing_period,business_type,selected_business_types,handoff_binding_hash')
    .eq('handoff_reference', reference)
    .in('status', ['created', 'provider_created'])
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;

  const cookieBinding = getCookieValue(request);
  if (!data.handoff_binding_hash || !cookieBinding) return null;
  if (await sha256Text(cookieBinding) !== data.handoff_binding_hash) return null;

  return {
    pendingSignupReference: reference,
    pendingSignupIntent: {
      email_encrypted: data.email_encrypted,
      email_hmac: data.email_hmac,
      first_name_encrypted: data.first_name_encrypted,
      first_name_hmac: data.first_name_hmac,
      last_name_encrypted: data.last_name_encrypted,
      last_name_hmac: data.last_name_hmac,
      phone_encrypted: data.phone_encrypted,
      phone_hmac: data.phone_hmac,
      business_name_encrypted: data.business_name_encrypted,
      business_name_hmac: data.business_name_hmac,
      pii_crypto_version: data.pii_crypto_version,
      plan_code: data.plan_code,
      billing_period: data.billing_period,
      business_type: data.business_type,
      selected_business_types: data.selected_business_types,
    },
  };
}
