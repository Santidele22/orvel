export const DASHBOARD_SPA_REWRITE = { src: '/dashboard(?:/.*)?', dest: '/dashboard/index.html' };
export const BOOKING_SPA_REWRITE = { src: '/booking(?:/.*)?', dest: '/dashboard/index.html' };
export const OPS_SPA_REWRITE = { src: '/ops(?:/.*)?', dest: '/ops/index.html' };
export const BOOKING_SHARE_SRC = '^/booking/(?!manage(?:/|$))([^/]+)(?:/[^/]+)?/?$';
export const BOOKING_SHARE_REWRITE = { src: BOOKING_SHARE_SRC, dest: '/booking-share' };

const FILESYSTEM_HANDLE = { handle: 'filesystem' };
const HOSTING_ROUTES = [
  DASHBOARD_SPA_REWRITE,
  BOOKING_SHARE_REWRITE,
  BOOKING_SPA_REWRITE,
  OPS_SPA_REWRITE,
];

function isSameRewrite(route, rewrite) {
  return route?.src === rewrite.src && route?.dest === rewrite.dest;
}

function hostingRouteCopies() {
  return HOSTING_ROUTES.map((rewrite) => ({ ...rewrite }));
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

  return { ...config, routes };
}
