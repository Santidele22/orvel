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
];

export const BILLING_ALLOWED_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-signature",
  "x-request-id",
  "idempotency-key",
  "x-idempotency-key",
  "x-timestamp",
  "x-cron-key",
].join(", ");

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isProductionRuntime(): boolean {
  return ["production", "prod"].includes(
    (Deno.env.get("ENVIRONMENT") || Deno.env.get("DENO_ENV") || "").toLowerCase(),
  );
}

export function getBillingAllowedOrigins(): string[] {
  const configuredOrigins = parseCsv(Deno.env.get("BILLING_ALLOWED_ORIGINS"));
  const appBaseUrl = Deno.env.get("APP_BASE_URL")?.trim();
  const publicSiteUrl = Deno.env.get("PUBLIC_SITE_URL")?.trim();

  const origins = [
    ...DEFAULT_PRODUCTION_ALLOWED_ORIGINS,
    ...configuredOrigins,
    ...(appBaseUrl ? [appBaseUrl] : []),
    ...(publicSiteUrl ? [publicSiteUrl] : []),
    ...(isProductionRuntime() ? [] : DEFAULT_DEV_ALLOWED_ORIGINS),
  ];

  return [...new Set(origins.map((origin) => origin.replace(/\/$/, "")))];
}

export function getBillingCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin")?.replace(/\/$/, "");
  const allowedOrigins = getBillingAllowedOrigins();
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : "";

  return {
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": BILLING_ALLOWED_HEADERS,
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

export function rejectDisallowedBrowserOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin")?.replace(/\/$/, "");

  if (!origin) {
    return null;
  }

  if (getBillingAllowedOrigins().includes(origin)) {
    return null;
  }

  return new Response(
    JSON.stringify({ error: "ORIGIN_NOT_ALLOWED", message: "Origin is not allowed for billing functions" }),
    {
      status: 403,
      headers: { ...getBillingCorsHeaders(req), "Content-Type": "application/json" },
    },
  );
}

export function requireServerSecret(name: string): string {
  const value = Deno.env.get(name)?.trim();

  if (!value) {
    throw new Error(`${name}_NOT_CONFIGURED`);
  }

  return value;
}
