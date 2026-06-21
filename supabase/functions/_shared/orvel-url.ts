const DEFAULT_APP_ORIGIN = "https://orvel.pro";
const LEGACY_DASHBOARD_ORIGIN = "https://dashboard.orvel.pro";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolveAppOrigin(
  configuredUrl: string | undefined | null,
): string {
  const rawUrl = configuredUrl?.trim();

  if (!rawUrl) {
    return DEFAULT_APP_ORIGIN;
  }

  try {
    const parsedUrl = new URL(rawUrl);

    if (parsedUrl.origin === LEGACY_DASHBOARD_ORIGIN) {
      return DEFAULT_APP_ORIGIN;
    }

    return parsedUrl.origin;
  } catch {
    return DEFAULT_APP_ORIGIN;
  }
}

export function buildDashboardUrl(path = "", configuredUrl?: string | null): string {
  const appOrigin = resolveAppOrigin(
    configuredUrl ?? (Deno.env.get("FRONTEND_URL") || Deno.env.get("APP_BASE_URL")),
  );
  const cleanPath = path ? `/${path.replace(/^\/+/, "")}` : "";

  return `${trimTrailingSlash(appOrigin)}/dashboard${cleanPath}`;
}

export function buildAppUrl(path = "", configuredUrl?: string | null): string {
  const appOrigin = resolveAppOrigin(
    configuredUrl ?? (Deno.env.get("FRONTEND_URL") || Deno.env.get("APP_BASE_URL")),
  );
  const cleanPath = path ? `/${path.replace(/^\/+/, "")}` : "";

  return `${trimTrailingSlash(appOrigin)}${cleanPath}`;
}
