import { resolveLandingDashboardBaseUrl } from './auth-return-to';

const DEFAULT_DASHBOARD_ORIGIN = 'https://dashboard.orvel.pro';

function shouldStayOnCurrentAuthHost(currentOrigin: string): boolean {
  try {
    const origin = new URL(currentOrigin);
    const host = origin.hostname;
    // The combined production host, its preview deployments and the local proxy keep the user where
    // they are. `qa.orvel.pro` used to be here; #1133 retired that environment.
    if (host === 'orvel.pro' || host === 'www.orvel.pro') return true;
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
