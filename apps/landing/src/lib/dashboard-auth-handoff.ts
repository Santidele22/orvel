type DashboardAuthMode = 'login' | 'signup';

type BillingSource = 'subscription';

const DASHBOARD_HOME = '/';
const DEFAULT_DASHBOARD_ORIGIN = 'http://localhost:4200';
const LANDING_ROOT_ORIGINS = new Set([
  'https://orvel.pro',
  'https://www.orvel.pro',
  'http://localhost:4321',
  'http://127.0.0.1:4321'
]);
const TOKEN_TEXT_PATTERN = /(access_token|refresh_token|id_token|code)/i;
const PAYMENT_ID_PATTERN = /(preapproval_id|collection_id|payment_id|merchant_order_id|external_reference|checkout_session_id)/i;
const PARAM_BLOCKLIST = /^(access_token|refresh_token|token|id_token|code|preapproval_id|collection_id|payment_id|status|status_detail|merchant_order_id|external_reference|checkout_session_id)$/i;

export function buildDashboardAuthUrl(input: {
  dashboardOrigin: string;
  mode: DashboardAuthMode;
  source?: BillingSource;
  returnTo?: string | null;
}): string {
  const authPath = input.mode === 'signup' ? '/auth/signup/plan' : '/auth/login';
  const authUrl = new URL(authPath, normalizeDashboardBaseUrl(input.dashboardOrigin));
  authUrl.searchParams.set('mode', input.mode === 'signup' ? 'signup' : 'login');
  if (input.source === 'subscription') {
    authUrl.searchParams.set('source', 'subscription');
  }
  authUrl.searchParams.set('returnTo', sanitizeDashboardReturnTo(input.returnTo));
  return authUrl.toString();
}

function normalizeDashboardBaseUrl(dashboardOrigin: string): string {
  const candidate = dashboardOrigin.trim() || DEFAULT_DASHBOARD_ORIGIN;
  try {
    const url = new URL(candidate);
    if (isLandingRootUrl(url)) return `${url.origin}/`;
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return `${DEFAULT_DASHBOARD_ORIGIN}/`;
  }
}

function isLandingRootUrl(url: URL): boolean {
  const isRootPath = url.pathname === '' || url.pathname === '/';
  return isRootPath && LANDING_ROOT_ORIGINS.has(url.origin);
}

function sanitizeDashboardReturnTo(returnTo: string | null | undefined): string {
  if (!returnTo) return DASHBOARD_HOME;

  const candidate = returnTo.trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return DASHBOARD_HOME;
  if (/^(?:javascript|data):/i.test(candidate)) return DASHBOARD_HOME;
  if (candidate === '/auth' || candidate.startsWith('/auth?') || candidate.startsWith('/auth/')) return DASHBOARD_HOME;
  if (TOKEN_TEXT_PATTERN.test(candidate) || PAYMENT_ID_PATTERN.test(candidate)) return DASHBOARD_HOME;

  try {
    const parsed = new URL(candidate, 'https://dashboard.orvel.local');
    if (parsed.origin !== 'https://dashboard.orvel.local') return DASHBOARD_HOME;
    if (parsed.pathname === '/auth' || parsed.pathname.startsWith('/auth/')) return DASHBOARD_HOME;
    if (hasBlockedParams(parsed.searchParams) || TOKEN_TEXT_PATTERN.test(parsed.hash) || PAYMENT_ID_PATTERN.test(parsed.hash)) return DASHBOARD_HOME;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DASHBOARD_HOME;
  }
}

function hasBlockedParams(params: URLSearchParams): boolean {
  for (const key of params.keys()) {
    if (PARAM_BLOCKLIST.test(key)) return true;
  }
  return false;
}
