import { resolveLandingDashboardBaseUrl } from './auth-return-to';

const DEFAULT_DASHBOARD_ORIGIN = 'https://dashboard.orvel.pro';

function shouldStayOnCurrentAuthHost(currentOrigin: string): boolean {
  try {
    const origin = new URL(currentOrigin);
    const host = origin.hostname;
    if (host === 'qa.orvel.pro') return true;
    if (host.endsWith('.vercel.app')) return true;
    if ((host === 'localhost' || host === '127.0.0.1') && origin.port === '3000') return true;
    return false;
  } catch {
    return false;
  }
}

export function buildInAppAuthRedirect(
  currentUrl: URL,
  mode: 'login' | 'signup',
  dashboardBaseUrl?: string | null
): string {
  const base = shouldStayOnCurrentAuthHost(currentUrl.origin)
    ? new URL(`${currentUrl.origin}/`)
    : (resolveLandingDashboardBaseUrl(dashboardBaseUrl, currentUrl.origin) ??
      new URL(`${DEFAULT_DASHBOARD_ORIGIN}/`));
  const target = new URL(mode === 'login' ? '/dashboard/login' : '/dashboard/signup', base.origin);
  const returnTo = currentUrl.searchParams.get('returnTo');
  if (returnTo) {
    target.searchParams.set('returnTo', returnTo);
  }
  return target.toString();
}
