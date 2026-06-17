const DEFAULT_DEV_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:4200",
  "http://localhost:4321",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4200",
  "http://127.0.0.1:4321",
];

const DEFAULT_PRODUCTION_ALLOWED_ORIGINS = [
  "https://orvel.pro",
  "https://www.orvel.pro",
  "https://dashboard.orvel.pro",
];

function parseCsv(value: string | undefined): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function isProductionRuntime(): boolean {
  return ["production", "prod"].includes((Deno.env.get("ENVIRONMENT") || Deno.env.get("DENO_ENV") || "").toLowerCase());
}

export function getSessionHandoffAllowedOrigins(): string[] {
  const configured = parseCsv(Deno.env.get("SESSION_HANDOFF_ALLOWED_ORIGINS"));
  const appBaseUrl = Deno.env.get("APP_BASE_URL")?.trim();
  const publicSiteUrl = Deno.env.get("PUBLIC_SITE_URL")?.trim();
  const origins = [
    ...DEFAULT_PRODUCTION_ALLOWED_ORIGINS,
    ...configured,
    ...(appBaseUrl ? [appBaseUrl] : []),
    ...(publicSiteUrl ? [publicSiteUrl] : []),
    ...(isProductionRuntime() ? [] : DEFAULT_DEV_ALLOWED_ORIGINS),
  ];
  return [...new Set(origins.map((origin) => origin.replace(/\/$/, "")))];
}

export function getSessionHandoffCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin")?.replace(/\/$/, "");
  const allowOrigin = origin && getSessionHandoffAllowedOrigins().includes(origin) ? origin : "";
  return {
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-request-id",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

export function rejectDisallowedSessionHandoffOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin")?.replace(/\/$/, "");
  if (!origin || getSessionHandoffAllowedOrigins().includes(origin)) return null;
  return new Response(JSON.stringify({ error: "ORIGIN_NOT_ALLOWED" }), {
    status: 403,
    headers: { ...getSessionHandoffCorsHeaders(req), "Content-Type": "application/json" },
  });
}
