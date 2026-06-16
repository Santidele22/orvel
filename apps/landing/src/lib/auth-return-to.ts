const DEFAULT_DASHBOARD_PATH = '/dashboard/inicio';
const DEFAULT_DASHBOARD_BASE_URL = 'https://dashboard.orvel.pro';

const PARAM_BLOCKLIST = /^(access_token|refresh_token|token|id_token|code|preapproval_id|collection_id|payment_id|status|status_detail|merchant_order_id|external_reference|checkout_session|checkout_session_id)$/i;
const TOKEN_OR_PAYMENT_TEXT = /(access_token|refresh_token|id_token|code|preapproval_id|collection_id|payment_id|merchant_order_id|external_reference|checkout_session|checkout_session_id)/i;
const BLOCKED_INTERNAL_PATH = /^\/(?:auth\/callback|(?:api\/)?checkout|test-checkout)(?:\/|$)/i;

type SanitizeLandingAuthReturnToOptions = {
  currentOrigin: string;
  dashboardBaseUrl?: string | null;
};

function inferLocalLandingDashboardBaseUrl(currentOrigin: string | null | undefined): URL | null {
  if (!currentOrigin) return null;

  try {
    const origin = new URL(currentOrigin);
    const isLocalHost = origin.hostname === 'localhost' || origin.hostname === '127.0.0.1' || origin.hostname === '[::1]';
    if (!isLocalHost) return null;

    if (origin.port === '3000') {
      return new URL('/dashboard/', origin);
    }

    if (origin.port !== '4321') return null;

    return new URL(`${origin.protocol}//${origin.hostname === '[::1]' ? '[::1]' : origin.hostname}:4200/`);
  } catch {
    return null;
  }
}

export function resolveLandingDashboardBaseUrl(
  raw: string | null | undefined,
  currentOrigin?: string | null
): URL | null {
  const value = raw?.trim();
  if (!value) return inferLocalLandingDashboardBaseUrl(currentOrigin);

  try {
    const url = new URL(value);
    if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`;
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

export function landingDefaultReturnTo(dashboardBaseUrl?: string | URL | null, currentOrigin?: string | null): string {
  const base = typeof dashboardBaseUrl === 'string'
    ? resolveLandingDashboardBaseUrl(dashboardBaseUrl, currentOrigin)
    : dashboardBaseUrl;
  const safeBase = base ?? resolveLandingDashboardBaseUrl(DEFAULT_DASHBOARD_BASE_URL);
  if (!safeBase) return DEFAULT_DASHBOARD_PATH;

  const relativePath = DEFAULT_DASHBOARD_PATH.startsWith(safeBase.pathname)
    ? DEFAULT_DASHBOARD_PATH.slice(safeBase.pathname.length)
    : DEFAULT_DASHBOARD_PATH.replace(/^\//, '');

  return new URL(relativePath, safeBase).toString();
}

function dashboardPathReturnTo(candidate: URL, dashboardBaseUrl: URL | null): string {
  const safeBase = dashboardBaseUrl ?? resolveLandingDashboardBaseUrl(DEFAULT_DASHBOARD_BASE_URL);
  if (!safeBase) return DEFAULT_DASHBOARD_PATH;

  const basePath = safeBase.pathname.replace(/\/$/, '');
  let relativePath: string;

  if (basePath && basePath !== '/' && candidate.pathname.startsWith(`${basePath}/`)) {
    relativePath = candidate.pathname.slice(basePath.length + 1);
  } else if (basePath && basePath !== '/' && candidate.pathname === basePath) {
    relativePath = '';
  } else if (!basePath || basePath === '/') {
    relativePath = candidate.pathname.replace(/^\//, '');
  } else {
    relativePath = candidate.pathname.replace(/^\/dashboard\/?/, '');
  }

  return new URL(`${relativePath}${candidate.search}${candidate.hash}`, safeBase).toString();
}

function hasBlockedParams(params: URLSearchParams): boolean {
  for (const key of params.keys()) {
    if (PARAM_BLOCKLIST.test(key)) return true;
  }
  return false;
}

function isAllowedInternalPath(pathname: string): boolean {
  return pathname === '/billing/subscription' || pathname.startsWith('/billing/subscription/');
}

function isDashboardPath(pathname: string): boolean {
  return pathname === '/dashboard' || pathname.startsWith('/dashboard/');
}

export function sanitizeLandingAuthReturnTo(
  raw: string | null | undefined,
  options: SanitizeLandingAuthReturnToOptions
): string {
  const dashboardBaseUrl = resolveLandingDashboardBaseUrl(options.dashboardBaseUrl, options.currentOrigin);
  const fallback = landingDefaultReturnTo(dashboardBaseUrl, options.currentOrigin);
  if (!raw) return fallback;

  const value = raw.trim();
  if (!value || value.startsWith('//') || /^(?:javascript|data):/i.test(value) || TOKEN_OR_PAYMENT_TEXT.test(value)) {
    return fallback;
  }

  try {
    const candidate = new URL(value, options.currentOrigin);

    if (
      hasBlockedParams(candidate.searchParams) ||
      TOKEN_OR_PAYMENT_TEXT.test(candidate.hash) ||
      BLOCKED_INTERNAL_PATH.test(candidate.pathname)
    ) {
      return fallback;
    }

    if (candidate.origin === options.currentOrigin && isDashboardPath(candidate.pathname)) {
      return dashboardPathReturnTo(candidate, dashboardBaseUrl);
    }

    if (candidate.origin === options.currentOrigin && isAllowedInternalPath(candidate.pathname)) {
      return `${candidate.pathname}${candidate.search}${candidate.hash}`;
    }

    if (
      dashboardBaseUrl &&
      candidate.origin === dashboardBaseUrl.origin &&
      candidate.pathname.startsWith(dashboardBaseUrl.pathname.replace(/\/$/, ''))
    ) {
      return candidate.toString();
    }
  } catch {
    // Fall back below.
  }

  return fallback;
}
