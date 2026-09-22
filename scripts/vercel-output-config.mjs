export const DASHBOARD_SPA_REWRITE = { src: '/dashboard(?:/.*)?', dest: '/dashboard/index.html' };
export const BOOKING_SPA_REWRITE = { src: '/booking(?:/.*)?', dest: '/dashboard/index.html' };
export const BOOKING_SHARE_SRC = '^/booking/(?!manage(?:/|$))([^/]+)(?:/[^/]+)?/?$';
export const BOOKING_SHARE_REWRITE = { src: BOOKING_SHARE_SRC, dest: '/booking-share' };

// Project-wide response headers for the combined deployment. They used to live in
// the per-app vercel.json files, which the combined project never reads, so they
// never reached production. `config.json` has no `headers` property: the Build
// Output API only applies them through a route, so they ship as a catch-all route
// with `continue: true`.
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const SECURITY_HEADERS_ROUTE_SRC = '/(.*)';
const FILESYSTEM_HANDLE = { handle: 'filesystem' };
const HOSTING_ROUTES = [DASHBOARD_SPA_REWRITE, BOOKING_SHARE_REWRITE, BOOKING_SPA_REWRITE];

function isSameRewrite(route, rewrite) {
  return route?.src === rewrite.src && route?.dest === rewrite.dest;
}

function isManagedHeadersRoute(route) {
  return route?.src === SECURITY_HEADERS_ROUTE_SRC && Boolean(route?.headers);
}

function hostingRouteCopies() {
  return HOSTING_ROUTES.map((rewrite) => ({ ...rewrite }));
}

function securityHeadersRoute() {
  return { src: SECURITY_HEADERS_ROUTE_SRC, headers: { ...SECURITY_HEADERS }, continue: true };
}

function withSecurityHeaders(routes) {
  return [securityHeadersRoute(), ...routes.filter((route) => !isManagedHeadersRoute(route))];
}

export function patchVercelOutputConfig(config) {
  const existingRoutes = Array.isArray(config?.routes) ? [...config.routes] : [];
  const withoutHostingRoutes = existingRoutes.filter(
    (route) => !HOSTING_ROUTES.some((rewrite) => isSameRewrite(route, rewrite)),
  );
  const filesystemIndex = withoutHostingRoutes.findIndex((route) => route?.handle === 'filesystem');
  const hostingRoutes = hostingRouteCopies();

  const routes =
    filesystemIndex >= 0
      ? [
          ...withoutHostingRoutes.slice(0, filesystemIndex + 1),
          ...hostingRoutes,
          ...withoutHostingRoutes.slice(filesystemIndex + 1),
        ]
      : [{ ...FILESYSTEM_HANDLE }, ...hostingRoutes, ...withoutHostingRoutes];

  return { ...config, routes: withSecurityHeaders(routes) };
}
