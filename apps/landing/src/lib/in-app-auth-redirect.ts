import { resolveLandingDashboardBaseUrl } from './auth-return-to';

const DEFAULT_DASHBOARD_ORIGIN = 'https://dashboard.orvel.pro';

export function buildInAppAuthRedirect(
  currentUrl: URL,
  mode: 'login' | 'signup',
  dashboardBaseUrl?: string | null
): string {
  const base =
    resolveLandingDashboardBaseUrl(dashboardBaseUrl, currentUrl.origin) ??
    new URL(`${DEFAULT_DASHBOARD_ORIGIN}/`);
  const target = new URL(
    mode === 'login' ? '/dashboard/auth/login' : '/dashboard/auth/signup',
    base.origin
  );
  const returnTo = currentUrl.searchParams.get('returnTo');
  if (returnTo) {
    target.searchParams.set('returnTo', returnTo);
  }
  return target.toString();
}
