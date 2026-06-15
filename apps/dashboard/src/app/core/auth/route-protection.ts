import { TURNERA_SESSION_KEY } from './session-contract';
import { SUPABASE_CONFIG } from './supabase-config';
import { createSupabaseAuthClient } from './supabase-auth.client';
import { isAllowedOnboardingBusinessType } from '../../features/onboarding/data-access/business-type-defaults';
import { CANONICAL_PLAN_CODES, PLAN_CODE_ALIASES } from '../plans/plan-entitlements';

let cachedAuthClient: ReturnType<typeof createSupabaseAuthClient> | null = null;

const LANDING_ORIGIN = 'https://orvel.pro';

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

  return value;
}

export function buildLandingLoginRedirect(returnTo: string): string {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  return `${LANDING_ORIGIN}/auth/login?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

export function buildMandatoryOnboardingRedirect(returnTo: string): string {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  return `/auth/onboarding?onboarding_required=true&returnTo=${encodeURIComponent(safeReturnTo)}`;
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
export async function checkSupabaseSession(): Promise<{
  allowed: boolean;
  redirectTo?: string;
}> {
  try {
    const authClient = getSupabaseAuthClient();
    const { data, error } = await authClient.getSession();

    if (error) {
      return { allowed: false, redirectTo: buildLandingLoginRedirect('/dashboard') };
    }

    // If we have a valid session, require persisted onboarding completeness before dashboard access.
    if (data?.session?.access_token) {
      if (!hasCompletedMandatoryOnboarding(data.session.user.user_metadata)) {
        return { allowed: false, redirectTo: buildMandatoryOnboardingRedirect('/dashboard') };
      }

      return { allowed: true };
    }

    // No Supabase session
    return { allowed: false, redirectTo: buildLandingLoginRedirect('/dashboard') };
  } catch {
    // On error, fail closed (deny access)
    return { allowed: false, redirectTo: buildLandingLoginRedirect('/dashboard') };
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
  _now = Date.now()
): Promise<{ allowed: boolean; redirectTo?: string }> {
  return checkSupabaseSession();
}

export async function logoutAndRedirect(): Promise<string> {
  try {
    const authClient = getSupabaseAuthClient();
    await authClient.signOut();
  } catch {
    // Ignore errors from Supabase logout
  }

  // Clear legacy localStorage data, but never trust it for dashboard access.
  localStorage.removeItem(TURNERA_SESSION_KEY);

  return `${LANDING_ORIGIN}/auth/login`;
}
