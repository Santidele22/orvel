export type DashboardAuthMode = 'login' | 'signup';

const DASHBOARD_HOME = '/';
const SAFE_MODE_VALUES = new Set<DashboardAuthMode>(['login', 'signup']);
const TOKEN_PARAM_PATTERN = /(?:^|[?#&])(access_token|refresh_token|token|id_token|code)=/i;
const TOKEN_TEXT_PATTERN = /(access_token|refresh_token|id_token)/i;

export function normalizeDashboardAuthRequest(url: string | URL): { mode: DashboardAuthMode; returnTo: string } {
  const parsedUrl = parseUrl(url);
  const requestedMode = parsedUrl.searchParams.get('mode');
  const mode = SAFE_MODE_VALUES.has(requestedMode as DashboardAuthMode)
    ? (requestedMode as DashboardAuthMode)
    : 'login';

  return {
    mode,
    returnTo: sanitizeDashboardReturnTo(parsedUrl.searchParams.get('returnTo'))
  };
}

export function resolveDashboardAuthSuccessRedirect(input: { returnTo?: string | null }): string {
  return sanitizeDashboardReturnTo(input.returnTo);
}

function parseUrl(url: string | URL): URL {
  if (url instanceof URL) return url;
  return new URL(url, 'https://dashboard.orvel.local');
}

function sanitizeDashboardReturnTo(returnTo: string | null | undefined): string {
  if (!returnTo) return DASHBOARD_HOME;

  const candidate = returnTo.trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return DASHBOARD_HOME;
  if (/^(?:javascript|data):/i.test(candidate)) return DASHBOARD_HOME;
  if (candidate === '/auth' || candidate.startsWith('/auth?') || candidate.startsWith('/auth/')) return DASHBOARD_HOME;
  if (TOKEN_TEXT_PATTERN.test(candidate) || TOKEN_PARAM_PATTERN.test(candidate)) return DASHBOARD_HOME;

  try {
    const parsed = new URL(candidate, 'https://dashboard.orvel.local');
    if (parsed.origin !== 'https://dashboard.orvel.local') return DASHBOARD_HOME;
    if (parsed.pathname === '/auth' || parsed.pathname.startsWith('/auth/')) return DASHBOARD_HOME;
    if (hasTokenBearingParams(parsed.searchParams) || TOKEN_TEXT_PATTERN.test(parsed.hash)) return DASHBOARD_HOME;

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DASHBOARD_HOME;
  }
}

function hasTokenBearingParams(params: URLSearchParams): boolean {
  for (const key of params.keys()) {
    if (/^(access_token|refresh_token|token|id_token|code)$/i.test(key)) return true;
  }
  return false;
}
