const DEFAULT_DASHBOARD_PATH = '/dashboard/inicio';

const PARAM_BLOCKLIST = /^(access_token|refresh_token|token|id_token|code|preapproval_id|collection_id|payment_id|status|status_detail|merchant_order_id|external_reference|checkout_session|checkout_session_id)$/i;
const TOKEN_OR_PAYMENT_TEXT = /(access_token|refresh_token|id_token|code|preapproval_id|collection_id|payment_id|merchant_order_id|external_reference|checkout_session|checkout_session_id)/i;
const BLOCKED_INTERNAL_PATH = /^\/(?:auth\/callback|(?:api\/)?checkout|test-checkout)(?:\/|$)/i;

type SanitizeLandingAuthReturnToOptions = {
  currentOrigin: string;
  dashboardBaseUrl?: string | null;
};

export function resolveLandingDashboardBaseUrl(raw: string | null | undefined): URL | null {
  const value = raw?.trim();
  if (!value) return null;

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

export function landingDefaultReturnTo(dashboardBaseUrl?: string | URL | null): string {
  const base = typeof dashboardBaseUrl === 'string' ? resolveLandingDashboardBaseUrl(dashboardBaseUrl) : dashboardBaseUrl;
  if (!base) return DEFAULT_DASHBOARD_PATH;

  const relativePath = DEFAULT_DASHBOARD_PATH.startsWith(base.pathname)
    ? DEFAULT_DASHBOARD_PATH.slice(base.pathname.length)
    : DEFAULT_DASHBOARD_PATH.replace(/^\//, '');

  return new URL(relativePath, base).toString();
}

function hasBlockedParams(params: URLSearchParams): boolean {
  for (const key of params.keys()) {
    if (PARAM_BLOCKLIST.test(key)) return true;
  }
  return false;
}

function isAllowedInternalPath(pathname: string): boolean {
  return pathname.startsWith('/dashboard') || pathname === '/billing/subscription' || pathname.startsWith('/billing/subscription/');
}

export function sanitizeLandingAuthReturnTo(
  raw: string | null | undefined,
  options: SanitizeLandingAuthReturnToOptions
): string {
  const dashboardBaseUrl = resolveLandingDashboardBaseUrl(options.dashboardBaseUrl);
  const fallback = landingDefaultReturnTo(dashboardBaseUrl);
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
