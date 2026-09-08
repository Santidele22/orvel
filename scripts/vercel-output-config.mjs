export const DASHBOARD_SPA_REWRITE = { src: '/dashboard(?:/.*)?', dest: '/dashboard/index.html' };
export const BOOKING_SPA_REWRITE = { src: '/booking(?:/.*)?', dest: '/dashboard/index.html' };

const FILESYSTEM_HANDLE = { handle: 'filesystem' };
const DASHBOARD_SPA_REWRITES = [DASHBOARD_SPA_REWRITE, BOOKING_SPA_REWRITE];

function isSameRewrite(route, rewrite) {
  return route?.src === rewrite.src && route?.dest === rewrite.dest;
}

function spaRewriteCopies() {
  return DASHBOARD_SPA_REWRITES.map((rewrite) => ({ ...rewrite }));
}

export function patchVercelOutputConfig(config) {
  const existingRoutes = Array.isArray(config?.routes) ? [...config.routes] : [];
  const withoutSpaRewrites = existingRoutes.filter(
    (route) => !DASHBOARD_SPA_REWRITES.some((rewrite) => isSameRewrite(route, rewrite)),
  );
  const filesystemIndex = withoutSpaRewrites.findIndex((route) => route?.handle === 'filesystem');
  const spaRewrites = spaRewriteCopies();

  const routes =
    filesystemIndex >= 0
      ? [
          ...withoutSpaRewrites.slice(0, filesystemIndex + 1),
          ...spaRewrites,
          ...withoutSpaRewrites.slice(filesystemIndex + 1),
        ]
      : [{ ...FILESYSTEM_HANDLE }, ...spaRewrites, ...withoutSpaRewrites];

  return { ...config, routes };
}
