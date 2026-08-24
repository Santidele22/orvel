import { LEGACY_DASHBOARD_SESSION_STORAGE_KEY } from './session-contract';
import { ACTIVE_BRANCH_STORAGE_KEY, ACTIVE_BUSINESS_STORAGE_KEY } from '../storage/browser-storage-keys';
import { resetBranchContextSession } from '../branches/branch-context.service';
import { SUPABASE_CONFIG } from './supabase-config';
import { createSupabaseAuthClient } from './supabase-auth.client';
import { isAllowedOnboardingBusinessType } from '../../features/onboarding/data-access/business-type-defaults';
import { CANONICAL_PLAN_CODES, PLAN_CODE_ALIASES } from '../plans/plan-entitlements';

let cachedAuthClient: ReturnType<typeof createSupabaseAuthClient> | null = null;

const CANONICAL_LANDING_ORIGIN = 'https://orvel.pro';
const LOCAL_LANDING_PORT = '4321';
const LOGIN_ROUTE = '/auth/login';
const PLAN_SELECTION_ROUTE = '/auth/signup/plan';
const SIGNUP_ONBOARDING_ROUTE = '/auth/signup/onboarding';
const PARAM_BLOCKLIST = /^(access_token|refresh_token|token|id_token|code|preapproval_id|collection_id|payment_id|status|status_detail|merchant_order_id|external_reference|checkout_session_id)$/i;
const TOKEN_OR_PAYMENT_TEXT = /(access_token|refresh_token|id_token|code|preapproval_id|collection_id|payment_id|merchant_order_id|external_reference|checkout_session_id)/i;
const SESSION_HANDOFF_PARAM = 'handoff';

/**
 * Gets the Supabase Auth client (cached for performance).
 */
function getSupabaseAuthClient() {
  if (!cachedAuthClient) {
    cachedAuthClient = createSupabaseAuthClient({
      supabaseUrl: SUPABASE_CONFIG.url,
      supabaseAnonKey: SUPABASE_CONFIG.anonKey
    });
  }
  return cachedAuthClient;
}

export function sanitizeReturnTo(returnTo: string | null | undefined): string {
  if (!returnTo) {
    return '/dashboard';
  }

  const value = returnTo.trim();

  if (!value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) {
    return '/dashboard';
  }

  if (TOKEN_OR_PAYMENT_TEXT.test(value)) {
    return '/dashboard';
  }

  try {
    const parsed = new URL(value, 'https://dashboard.orvel.local');
    if (parsed.origin !== 'https://dashboard.orvel.local') {
      return '/dashboard';
    }
    for (const key of parsed.searchParams.keys()) {
      if (PARAM_BLOCKLIST.test(key)) {
        return '/dashboard';
      }
    }
    if (TOKEN_OR_PAYMENT_TEXT.test(parsed.hash)) {
      return '/dashboard';
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/dashboard';
  }
}

export function buildLandingLoginRedirect(returnTo: string): string {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  return `${resolveLandingOrigin()}${LOGIN_ROUTE}?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

type SessionHandoffAuth = {
  setSession(session: { access_token: string; refresh_token: string }): Promise<{ error?: { message?: string } | null }>;
};

type RedeemDashboardSessionHandoffInput = {
  functionUrl?: string;
  fetch?: typeof fetch;
  auth?: SessionHandoffAuth;
};

function currentBrowserUrl(): URL | null {
  const location = (globalThis as { window?: { location?: Location } }).window?.location;
  if (!location?.href) return null;

  try {
    return new URL(location.href);
  } catch {
    return null;
  }
}

function stripHandoffParam(url: URL): void {
  const win = (globalThis as { window?: { history?: { replaceState?: History['replaceState'] } } }).window;
  url.searchParams.delete(SESSION_HANDOFF_PARAM);
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  win?.history?.replaceState?.(null, '', nextUrl);
}

function resolveRedeemFunctionUrl(): string {
  return new URL('/functions/v1/redeem-session-handoff', SUPABASE_CONFIG.url).toString();
}

export async function redeemDashboardSessionHandoff(
  input: RedeemDashboardSessionHandoffInput = {}
): Promise<{ redeemed: boolean }> {
  const url = currentBrowserUrl();
  const handoff = url?.searchParams.get(SESSION_HANDOFF_PARAM)?.trim();
  if (!url || !handoff) {
    return { redeemed: false };
  }

  try {
    const response = await (input.fetch ?? fetch)(input.functionUrl ?? resolveRedeemFunctionUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handoff })
    });

    if (!response.ok) {
      stripHandoffParam(url);
      return { redeemed: false };
    }

    const data = await response.json();
    if (typeof data?.access_token !== 'string' || typeof data?.refresh_token !== 'string') {
      stripHandoffParam(url);
      return { redeemed: false };
    }

    const auth = input.auth ?? getSupabaseAuthClient();
    const { error } = await auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token
    });

    stripHandoffParam(url);
    return { redeemed: !error };
  } catch {
    if (url) stripHandoffParam(url);
    return { redeemed: false };
  }
}

export function buildLandingPlanSelectionRedirect(returnTo: string): string {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  const params = new URLSearchParams({
    reason: 'missing_account',
    intent: 'create_account',
    returnTo: safeReturnTo
  });
  return `${resolveLandingOrigin()}${PLAN_SELECTION_ROUTE}?${params.toString()}`;
}

function originFromUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.origin;
  } catch {
    return null;
  }
}

function resolveLandingOrigin(): string {
  const env = globalThis as {
    process?: { env?: Record<string, string | undefined> };
    window?: {
      __ORVEL_DASHBOARD_ENV__?: { PUBLIC_LANDING_URL?: string };
      location?: { hostname?: string; protocol?: string };
    };
  };

  const fromProcess = originFromUrl(env.process?.env?.['PUBLIC_LANDING_URL']);
  if (fromProcess) return fromProcess;

  const fromWindow = originFromUrl(env.window?.__ORVEL_DASHBOARD_ENV__?.PUBLIC_LANDING_URL);
  if (fromWindow) return fromWindow;

  if (env.window?.location?.hostname === 'qa.orvel.pro') {
    return 'https://qa.orvel.pro';
  }

  return resolveLocalLandingOrigin() ?? CANONICAL_LANDING_ORIGIN;
}

function resolveLocalLandingOrigin(): string | null {
  const location = (globalThis as { window?: { location?: { protocol?: string; hostname?: string } } }).window?.location;
  const hostname = location?.hostname;
  if (!hostname || !isLocalHostname(hostname)) {
    return null;
  }

  return `${location?.protocol === 'https:' ? 'https:' : 'http:'}//${hostname}:${LOCAL_LANDING_PORT}`;
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

export function buildMandatoryOnboardingRedirect(returnTo: string): string {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  const sourceUrl = new URL(safeReturnTo, 'https://dashboard.orvel.local');
  const dashboardReturnTo = sourceUrl.pathname === '/auth/onboarding' ? '/dashboard/inicio' : safeReturnTo;
  const params = new URLSearchParams({
    onboarding_required: 'true',
    returnTo: dashboardReturnTo
  });
  const plan = sourceUrl.searchParams.get('plan');
  const billing = sourceUrl.searchParams.get('billing');
  if (plan) params.set('plan', plan);
  if (billing) params.set('billing', billing);
  return `${resolveLandingOrigin()}${SIGNUP_ONBOARDING_ROUTE}?${params.toString()}`;
}

function hasCanonicalOrLegacyPlan(plan: unknown): boolean {
  if (typeof plan !== 'string') {
    return false;
  }

  const normalizedPlan = plan.trim().toUpperCase();
  return (
    (CANONICAL_PLAN_CODES as readonly string[]).includes(normalizedPlan) ||
    Object.prototype.hasOwnProperty.call(PLAN_CODE_ALIASES, normalizedPlan)
  );
}

function hasSelectedPlan(metadata: Record<string, unknown> | undefined): boolean {
  return hasCanonicalOrLegacyPlan(metadata?.['plan']);
}

function hasSelectedPlanCode(plan: unknown): boolean {
  return hasCanonicalOrLegacyPlan(plan);
}

async function loadDashboardAuthState(authClient: ReturnType<typeof getSupabaseAuthClient>) {
  if (typeof authClient.getDashboardAuthState !== 'function') {
    return null;
  }

  try {
    const result = await authClient.getDashboardAuthState();
    return result?.data ?? null;
  } catch {
    return null;
  }
}

export function hasCompletedMandatoryOnboarding(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) {
    return false;
  }

  const onboardingCompleted = metadata['onboardingCompleted'] === true || metadata['onboarding_completed'] === true;
  const plan = metadata['plan'];
  const businessType = metadata['tipoNegocio'] ?? metadata['businessType'] ?? metadata['business_type'];

  return onboardingCompleted && hasCanonicalOrLegacyPlan(plan) && isAllowedOnboardingBusinessType(businessType);
}

/**
 * Checks if user can access dashboard using Supabase session.
 * This is the new KB-002 way.
 */
export async function checkSupabaseSession(returnTo = '/dashboard'): Promise<{
  allowed: boolean;
  redirectTo?: string;
}> {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  try {
    const authClient = getSupabaseAuthClient();
    const { data, error } = await authClient.getSession();

    if (error) {
      return { allowed: false, redirectTo: buildLandingLoginRedirect(safeReturnTo) };
    }

    // If we have a valid session, require persisted onboarding completeness before dashboard access.
    if (data?.session?.access_token) {
      const metadata = data.session.user.user_metadata;
      const serverState = await loadDashboardAuthState(authClient);

      if (
        serverState?.dashboard_ready === true &&
        hasSelectedPlanCode(serverState.selected_plan_code) &&
        isAllowedOnboardingBusinessType(serverState.business_type)
      ) {
        return { allowed: true };
      }

      const selectedPlan = serverState?.selected_plan_code ?? metadata?.['plan'];
      if (!hasSelectedPlanCode(selectedPlan)) {
        return { allowed: false, redirectTo: buildLandingPlanSelectionRedirect(safeReturnTo) };
      }

      return { allowed: false, redirectTo: buildMandatoryOnboardingRedirect(safeReturnTo) };
    }

    // No Supabase session
    return { allowed: false, redirectTo: buildLandingLoginRedirect(safeReturnTo) };
  } catch {
    // On error, fail closed (deny access)
    return { allowed: false, redirectTo: buildLandingLoginRedirect(safeReturnTo) };
  }
}

/**
 * Synchronous check if user can access dashboard.
 * Fails closed for protected dashboard routes. Production routing must use
 * canAccessDashboardAsync() so Supabase can verify the session and mandatory
 * onboarding metadata.
 *
 * For full Supabase support, use canAccessDashboardAsync().
 *
 * @param now - Current timestamp for testing
 * @returns { allowed: boolean; redirectTo?: string }
 */
export function canAccessDashboard(_now = Date.now()): {
  allowed: boolean;
  redirectTo?: string;
} {
  return { allowed: false, redirectTo: buildLandingLoginRedirect('/dashboard') };
}

/**
 * Async check if user can access dashboard with Supabase session support.
 * This is the full KB-002 implementation.
 *
 * Requires a Supabase session with persisted mandatory onboarding metadata.
 * Legacy localStorage is never accepted as authorization for protected routes.
 *
 * @param now - Current timestamp for testing
 * @returns { allowed: boolean; redirectTo?: string }
 */
export async function canAccessDashboardAsync(
  _now = Date.now(),
  returnTo = '/dashboard'
): Promise<{ allowed: boolean; redirectTo?: string }> {
  await redeemDashboardSessionHandoff();
  return checkSupabaseSession(returnTo);
}

export async function logoutAndRedirect(): Promise<string> {
  try {
    const authClient = getSupabaseAuthClient();
    await authClient.signOut();
  } catch {
    // Ignore errors from Supabase logout
  }

  // Clear legacy localStorage data, but never trust it for dashboard access.
  localStorage.removeItem(LEGACY_DASHBOARD_SESSION_STORAGE_KEY);
  localStorage.removeItem(ACTIVE_BUSINESS_STORAGE_KEY);
  localStorage.removeItem(ACTIVE_BRANCH_STORAGE_KEY);
  resetBranchContextSession();

  return buildLandingLoginRedirect('/dashboard');
}
