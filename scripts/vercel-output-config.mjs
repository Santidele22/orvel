export const DASHBOARD_SPA_REWRITE = { src: '/dashboard(?:/.*)?', dest: '/dashboard/index.html' };
export const BOOKING_SPA_REWRITE = { src: '/booking(?:/.*)?', dest: '/dashboard/index.html' };
export const BOOKING_SHARE_SRC = '^/booking/(?!manage(?:/|$))([^/]+)(?:/[^/]+)?/?$';
export const BOOKING_SHARE_REWRITE = { src: BOOKING_SHARE_SRC, dest: '/booking-share' };

// Project-wide response headers for the combined deployment. They used to live in
// the per-app vercel.json files, which the combined project never reads, so they
// never reached production. `config.json` has no `headers` property: the Build
// Output API only applies them through a route, so they ship as a catch-all route
// with `continue: true`.

// One year, deliberately without `includeSubDomains` or `preload`: this project
// has no DNS inventory in the repository, and both flags are hard to walk back
// once browsers cache them.
export const STRICT_TRANSPORT_SECURITY = 'max-age=31536000';

const BASE_SUPABASE_ORIGINS = ['https://*.supabase.co'];
const VERCEL_INSIGHTS_ORIGINS = ['https://*.vercel-insights.com'];

function normalizeOrigin(origin) {
  if (!origin) return null;
  try {
    const { origin: parsed } = new URL(origin);
    return parsed === 'null' ? null : parsed;
  } catch {
    return null;
  }
}

// Supabase Realtime runs over a websocket, so connect-src needs the wss:// twin of
// every allowed https:// origin. `dashboard-notifications.service.ts` subscribes
// to a channel, so a missing wss entry would silently kill live notifications.
function websocketTwin(origin) {
  return origin.startsWith('https://') ? `wss://${origin.slice('https://'.length)}` : null;
}

/**
 * Content-Security-Policy for the combined deployment.
 *
 * `script-src` keeps `'unsafe-inline'` on purpose: `apps/dashboard/src/index.html`
 * boots the PWA with three inline scripts and an inline `onload` handler, so a
 * strict `script-src 'self'` would break the splash screen and the retry guard.
 * Moving those scripts to files is the follow-up that lets this directive drop
 * inline. Everything else is locked down, and `connect-src` is what actually
 * bounds token exfiltration if an XSS ever lands.
 */
export function buildContentSecurityPolicy({ supabaseOrigin, extraConnectOrigins = [] } = {}) {
  const supabaseOrigins = [normalizeOrigin(supabaseOrigin), ...BASE_SUPABASE_ORIGINS].filter(Boolean);
  const connectSrc = [
    "'self'",
    ...new Set([
      ...supabaseOrigins,
      ...supabaseOrigins.map(websocketTwin).filter(Boolean),
      'wss://*.supabase.co',
      ...VERCEL_INSIGHTS_ORIGINS,
      ...extraConnectOrigins.filter(Boolean),
    ]),
  ];
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${supabaseOrigins.join(' ')}`,
    `connect-src ${connectSrc.join(' ')}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];
  return directives.join('; ');
}

export function buildSecurityHeaders(options = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': STRICT_TRANSPORT_SECURITY,
    'Content-Security-Policy': buildContentSecurityPolicy(options),
  };
}

export const SECURITY_HEADERS = buildSecurityHeaders();

export const SECURITY_HEADERS_ROUTE_SRC = '/(.*)';
const FILESYSTEM_HANDLE = { handle: 'filesystem' };

/**
 * The console (ADR 0012) is served from its own origin and its own Vercel project, so it owns the
 * root path: one SPA fallback, and none of the landing's path rewrites. Shipping `/dashboard/*` or
 * `/booking/*` there would make the console answer for paths that no longer belong to it.
 */
export const WEB_CONSOLE_SPA_REWRITE = { src: '/(.*)', dest: '/index.html' };

/** Rewrites of the combined deployment (landing + pwa + turnero on one origin). */
export const COMBINED_HOSTING_ROUTES = [DASHBOARD_SPA_REWRITE, BOOKING_SHARE_REWRITE, BOOKING_SPA_REWRITE];

/** Rewrites of the standalone console artifact. */
export const WEB_CONSOLE_HOSTING_ROUTES = [WEB_CONSOLE_SPA_REWRITE];

function isSameRewrite(route, rewrite) {
  return route?.src === rewrite.src && route?.dest === rewrite.dest;
}

function isManagedHeadersRoute(route) {
  return route?.src === SECURITY_HEADERS_ROUTE_SRC && Boolean(route?.headers);
}

function hostingRouteCopies(hostingRoutes) {
  return hostingRoutes.map((rewrite) => ({ ...rewrite }));
}

function securityHeadersRoute(options) {
  return { src: SECURITY_HEADERS_ROUTE_SRC, headers: buildSecurityHeaders(options), continue: true };
}

function withSecurityHeaders(routes, options) {
  return [securityHeadersRoute(options), ...routes.filter((route) => !isManagedHeadersRoute(route))];
}

/**
 * Patch a Vercel Build Output `config.json`.
 *
 * `options.hostingRoutes` selects which artifact this is: the combined deployment (the default) or
 * the standalone console. `options.supabaseOrigin` feeds the CSP, as before.
 */
export function patchVercelOutputConfig(config, options = {}) {
  const managedHostingRoutes = options.hostingRoutes ?? COMBINED_HOSTING_ROUTES;
  const existingRoutes = Array.isArray(config?.routes) ? [...config.routes] : [];
  const withoutHostingRoutes = existingRoutes.filter(
    (route) => !managedHostingRoutes.some((rewrite) => isSameRewrite(route, rewrite)),
  );
  const filesystemIndex = withoutHostingRoutes.findIndex((route) => route?.handle === 'filesystem');
  const hostingRoutes = hostingRouteCopies(managedHostingRoutes);

  const routes =
    filesystemIndex >= 0
      ? [
          ...withoutHostingRoutes.slice(0, filesystemIndex + 1),
          ...hostingRoutes,
          ...withoutHostingRoutes.slice(filesystemIndex + 1),
        ]
      : [{ ...FILESYSTEM_HANDLE }, ...hostingRoutes, ...withoutHostingRoutes];

  return { ...config, routes: withSecurityHeaders(routes, options) };
}
