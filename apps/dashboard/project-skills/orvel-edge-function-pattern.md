---
name: orvel-edge-function-pattern
description: Standard boilerplate for Supabase Edge Functions — shared module imports, rate limiting, CORS preflight, origin validation, server secret validation, standard error shape, and structured observability.
triggers: "edge function, supabase function, deno, _shared, rate limit, CORS, preflight, origin validation, server secret, billing security, error shape, observability, structured logging, supabase deploy"
---

# Orvel Edge Function Pattern

## Purpose
Standardize the boilerplate and conventions for all Supabase Edge Functions in the Orvel ecosystem. Every edge function must follow the same pattern: shared module imports (`_shared/`), rate limiting, CORS preflight + origin validation, server secret validation via `requireServerSecret()`, standard error shape `{ success: false, error: "ERROR_CODE" }`, and structured observability with JSON metrics.

## When to Use
- Creating a new Supabase Edge Function
- Modifying an existing edge function
- Adding rate limiting to a function
- Implementing CORS or origin validation
- Adding structured observability logging
- Consuming shared modules from `_shared/`
- Deploying or testing edge functions

## Mandatory Rules

### 1. Shared Module Conventions (`_shared/` imports)
All edge functions import common utilities from `../_shared/`:

```typescript
import { getBillingCorsHeaders, rejectDisallowedBrowserOrigin, requireServerSecret } from "../_shared/billing-security.ts";
import { evaluatePreapprovalPlanRollout } from "../_shared/mp-rollout-control.ts";
import { resolveTrustedPaidPlanMapping } from "../_shared/mp-subscription-guards.ts";
```

Available shared modules:
| Module | Purpose |
|--------|---------|
| `billing-security.ts` | CORS, origin validation, server secret, HMAC signature verification |
| `mp-rollout-control.ts` | Percentage-based rollout gating for MP features |
| `mp-subscription-guards.ts` | Plan mapping validation, webhook status mapping, domain error codes |
| `mercadopago-plan-variants.ts` | Plan variant builders (monthly, quarterly, annual) |

### 2. Rate Limiting (Per-Function Map<string, number[]>)
Every sensitive edge function MUST implement per-IP rate limiting:

```typescript
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitStore = new Map<string, number[]>();

function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("client-ip") ||
    "unknown"
  );
}

function isRateLimited(req: Request): boolean {
  const now = Date.now();
  const ip = getClientIp(req);
  const recent = (rateLimitStore.get(ip) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitStore.set(ip, recent);
    return true;
  }

  recent.push(now);
  rateLimitStore.set(ip, recent);
  return false;
}
```

Rate-limited responses MUST return:
- HTTP `429` status
- `Retry-After: 60` header
- `RATE_LIMIT_EXCEEDED` error code

### 3. CORS Preflight + Origin Validation
Every edge function MUST handle CORS in this exact order:

```typescript
Deno.serve(async (req) => {
  const corsHeaders = getBillingCorsHeaders(req);

  // 1. Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 2. Validate browser origin
  const disallowedOrigin = rejectDisallowedBrowserOrigin(req);
  if (disallowedOrigin) return disallowedOrigin;

  // 3. Rate limiting
  if (isRateLimited(req)) {
    return new Response(
      JSON.stringify({ error: "RATE_LIMIT_EXCEEDED", message: "Too many requests" }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      }
    );
  }

  // ... rest of function logic
});
```

The `getBillingCorsHeaders()` function:
- Reads `BILLING_ALLOWED_ORIGINS` from env (comma-separated).
- Adds `APP_BASE_URL` and `PUBLIC_SITE_URL` automatically.
- Adds dev origins (`localhost:3000`, `localhost:4200`, etc.) in non-production.
- Reflects the requesting origin if it's in the allowed list.

The `rejectDisallowedBrowserOrigin()` function:
- Returns `null` if allowed or no Origin header (server-to-server).
- Returns a 403 `Response` with `ORIGIN_NOT_ALLOWED` error if disallowed.

### 4. Server Secret Validation via requireServerSecret()
```typescript
export function requireServerSecret(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`${name}_NOT_CONFIGURED`);
  }
  return value;
}
```

Usage:
```typescript
const supabaseUrl = requireServerSecret("SUPABASE_URL");
const serviceRoleKey = requireServerSecret("SUPABASE_SERVICE_ROLE_KEY");
const mpAccessToken = requireServerSecret("MP_ACCESS_TOKEN");
```

- Always use `requireServerSecret()` instead of direct `Deno.env.get()`.
- The error name pattern is `{NAME}_NOT_CONFIGURED`.
- These throw — wrap in try/catch at the function handler level.

### 5. Standard Error Shape
Every edge function MUST return errors in this shape:

```typescript
// Error response
{
  "error": "ERROR_CODE",        // SCREAMING_SNAKE_CASE error code
  "message": "Human-readable description",
  "correlation_id": "uuid"      // Optional: for tracing
}

// Success response
{
  "success": true,
  // ... data fields
}
```

Error codes used across functions:
| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `INVALID_JSON` | 400 | Request body is not valid JSON |
| `PLAN_CODE_REQUIRED` | 400 | Missing required field |
| `INVALID_TIER_OR_CADENCE` | 400 | Invalid tier/cadence combination |
| `PLAN_NOT_FOUND` | 404 | Plan not found or inactive |
| `PREAPPROVAL_PLAN_NOT_SYNCED` | 409 | No MP plan mapping exists |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | Duplicate idempotent request |
| `ROLLOUT_BLOCKED` | 503 | Feature not available during canary |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `ORIGIN_NOT_ALLOWED` | 403 | Origin not in allowed list |
| `INVALID_TOKEN` | 401 | Auth token invalid |
| `MP_CONFIG_ERROR` | 500 | MP not configured server-side |
| `MP_API_ERROR` | 500 | MP API returned an error |
| `MP_INVALID_RESPONSE` | 500 | MP returned unexpected response |

### 6. Structured Observability with JSON Metrics
ALL console logging MUST use structured JSON:

```typescript
// ✅ GOOD: Structured JSON
console.log(JSON.stringify({
  metric: 'mp_preapproval_create_result',
  tenant_id: input.tenantId,
  result: input.result,
  latency_ms: input.latencyMs,
  // ...
}));

// ❌ BAD: Free-form strings
console.log(`Preapproval result: ${result} for tenant ${tenantId}`);
```

Observability rules:
- Every function should define its own metric events.
- NO secrets/logic/sensitive data in logs (redact via `sanitizeMetadata()`).
- Include `correlation_id` or `x-request-id` for tracing.
- Include `latency_ms` for performance tracking.
- Use `actor_correlation_id` (opaque hash) instead of raw `user_id`.

### 7. Standard Function Structure
Every edge function `index.ts` MUST follow this structure:

```typescript
// 1. Imports from _shared/
// 2. Constants (rate limit config, API URLs)
// 3. Rate limit state (Map<string, number[]>)
// 4. Helper functions (private to module)
// 5. Deno.serve handler:
//    a. CORS headers
//    b. Request timing start
//    c. Correlation ID extraction
//    d. OPTIONS preflight handling
//    e. Origin validation
//    f. Rate limiting
//    g. Try/catch with error handling
//    h. Structured logging at key decision points
//    i. Standard error shape responses
```

## Anti-Patterns

- ❌ **Using `console.log` with string interpolation** — always use `JSON.stringify({...})`.
- ❌ **Placing rate limit state outside the function scope** — the `Map` should be module-level.
- ❌ **Skipping origin validation for browser-facing endpoints** — always call `rejectDisallowedBrowserOrigin()`.
- ❌ **Calling `Deno.env.get()` directly without `requireServerSecret()`** — the function provides clear error messages.
- ❌ **Returning non-standard error shapes** — always use `{ error: "CODE", message: "..." }`.
- ❌ **Hard-coding allowed origins** — use `BILLING_ALLOWED_ORIGINS` env var.
- ❌ **Exposing server internals in error messages** — sanitize upstream errors.
- ❌ **Skipping CORS preflight handling** — all functions must handle OPTIONS.

## Examples

### Complete Edge Function Template
```typescript
// supabase/functions/my-function/index.ts
import { getBillingCorsHeaders, rejectDisallowedBrowserOrigin, requireServerSecret } from "../_shared/billing-security.ts";

const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitStore = new Map<string, number[]>();

function getClientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function isRateLimited(req: Request): boolean {
  const now = Date.now();
  const ip = getClientIp(req);
  const recent = (rateLimitStore.get(ip) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) return true;
  recent.push(now);
  rateLimitStore.set(ip, recent);
  return false;
}

Deno.serve(async (req) => {
  const corsHeaders = getBillingCorsHeaders(req);
  const requestStartedAt = Date.now();
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const disallowedOrigin = rejectDisallowedBrowserOrigin(req);
  if (disallowedOrigin) return disallowedOrigin;

  if (isRateLimited(req)) {
    return new Response(
      JSON.stringify({ error: "RATE_LIMIT_EXCEEDED", message: "Too many requests" }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } }
    );
  }

  try {
    const supabaseUrl = requireServerSecret("SUPABASE_URL");

    // Function logic here...

    console.log(JSON.stringify({
      metric: 'my_function_result',
      correlation_id: correlationId,
      result: 'success',
      latency_ms: Date.now() - requestStartedAt,
    }));

    return new Response(
      JSON.stringify({ success: true, data: {} }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(JSON.stringify({
      metric: 'my_function_error',
      correlation_id: correlationId,
      error: (error as Error).message,
      latency_ms: Date.now() - requestStartedAt,
    }));

    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", message: "Internal server error", correlation_id: correlationId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

### Webhook Signature Verification
```typescript
import { verifyMercadoPagoWebhookSignature } from "../_shared/billing-security.ts";

const rawBody = await req.text();
const isValid = await verifyMercadoPagoWebhookSignature(req, rawBody);
if (!isValid) {
  return new Response(
    JSON.stringify({ error: "INVALID_SIGNATURE", message: "Invalid webhook signature" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

## Checklist
- [ ] Function has rate limiting with `Map<string, number[]>` at module level
- [ ] CORS preflight handled (`OPTIONS → 200 "ok"`)
- [ ] Origin validation via `rejectDisallowedBrowserOrigin(req)`
- [ ] Server secrets loaded via `requireServerSecret()` (not direct `Deno.env.get()`)
- [ ] Standard error shape `{ error: "CODE", message: "..." }`
- [ ] Structured JSON logging for key events (not string interpolation)
- [ ] Correlation ID propagated through requests and responses
- [ ] Latency tracking with `Date.now() - requestStartedAt`
- [ ] Imports from `_shared/` use relative `../_shared/` paths
- [ ] Deadline/Deno KV handlers follow the same pattern for consistency
