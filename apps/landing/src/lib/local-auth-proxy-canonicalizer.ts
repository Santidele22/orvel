const LOCAL_LANDING_DEV_PORT = '4321';
const LOCAL_PROXY_ORIGIN = 'http://localhost:3000';
const STALE_INICIO_RETURN_TO = new Set(['/inicio', 'inicio']);

function isLocalLandingDevOrigin(url: URL): boolean {
  return (
    url.protocol === 'http:' &&
    url.port === LOCAL_LANDING_DEV_PORT &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  );
}

function normalizeStaleReturnTo(searchParams: URLSearchParams): void {
  const returnTo = searchParams.get('returnTo');
  if (returnTo && STALE_INICIO_RETURN_TO.has(returnTo.trim())) {
    searchParams.set('returnTo', '/dashboard/inicio');
  }
}

export function buildLocalProxyAuthCanonicalUrl(href: string, proxyOrigin = LOCAL_PROXY_ORIGIN): string | null {
  let currentUrl: URL;
  let proxyUrl: URL;

  try {
    currentUrl = new URL(href);
    proxyUrl = new URL(proxyOrigin);
  } catch {
    return null;
  }

  if (!isLocalLandingDevOrigin(currentUrl)) return null;
  if (currentUrl.pathname !== '/auth/login') return null;

  const canonicalUrl = new URL(currentUrl.pathname, proxyUrl.origin);
  canonicalUrl.search = currentUrl.search;
  canonicalUrl.hash = currentUrl.hash;
  normalizeStaleReturnTo(canonicalUrl.searchParams);

  if (canonicalUrl.href === currentUrl.href) return null;
  return canonicalUrl.href;
}
