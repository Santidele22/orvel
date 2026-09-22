export const DASHBOARD_SPA_REWRITE = { src: '/dashboard(?:/.*)?', dest: '/dashboard/index.html' };
export const BOOKING_SPA_REWRITE = { src: '/booking(?:/.*)?', dest: '/dashboard/index.html' };
export const BOOKING_SHARE_SRC = '^/booking/(?!manage(?:/|$))([^/]+)(?:/[^/]+)?/?$';
export const BOOKING_SHARE_REWRITE = { src: BOOKING_SHARE_SRC, dest: '/booking-share' };

// Project-wide response headers for the combined deployment. They used to live in
// the per-app vercel.json files, which the combined project never reads, so they
// never reached production; the build output config is the artifact Vercel applies.
export const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const SECURITY_HEADERS_SOURCE = '/(.*)';
const FILESYSTEM_HANDLE = { handle: 'filesystem' };
const HOSTING_ROUTES = [DASHBOARD_SPA_REWRITE, BOOKING_SHARE_REWRITE, BOOKING_SPA_REWRITE];

function isSameRewrite(route, rewrite) {
  return route?.src === rewrite.src && route?.dest === rewrite.dest;
}

function hostingRouteCopies() {
  return HOSTING_ROUTES.map((rewrite) => ({ ...rewrite }));
}

function patchHeaders(existingHeaders) {
  const existing = Array.isArray(existingHeaders) ? [...existingHeaders] : [];
  const withoutManagedHeaders = existing.filter((entry) => entry?.source !== SECURITY_HEADERS_SOURCE);

  return [
    { source: SECURITY_HEADERS_SOURCE, headers: SECURITY_HEADERS.map((header) => ({ ...header })) },
    ...withoutManagedHeaders,
  ];
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

  return { ...config, routes, headers: patchHeaders(config?.headers) };
}
