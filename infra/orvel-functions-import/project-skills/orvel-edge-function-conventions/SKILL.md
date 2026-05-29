---
name: orvel-edge-function-conventions
description: Standard Edge Function structure for orvel-functions Supabase project — imports, rate limiting, CORS, origin validation, server secrets, business logic, and observability patterns.
triggers: writing a new edge function, modifying an existing function, reviewing function structure
---

# Orvel Edge Function Conventions

## When to Use

- Creating a new Supabase Edge Function in `supabase/functions/<name>/`
- Refactoring an existing function to follow conventions
- Reviewing a PR for function structure compliance

## Rules

1. **Every function lives at** `supabase/functions/<name>/index.ts`
2. **Standard 3-line header comment** at the top
3. **Imports follow a fixed order**: external → shared → local
4. **Rate limiting**: per-function in-memory `Map<string, number[]>`, always copied (see below)
5. **CORS**: always use `getBillingCorsHeaders(req)` from `_shared/billing-security.ts`
6. **Origin validation**: always call `rejectDisallowedBrowserOrigin(req)` after OPTIONS handling
7. **Server secrets**: always use `requireServerSecret("NAME")` from `_shared/billing-security.ts` — never read `Deno.env.get()` directly for required secrets
8. **Error shape**: `{ success: false, error: "ERROR_CODE" }` for failures, `{ success: true, ... }` for success
9. **Logging**: structured JSON with `console.log(JSON.stringify({...}))` — include `metric` field for observability metrics
10. **Deno 2**: use `Deno.serve(async (req) => { ... })` — not the older `serve()` import

## Steps

### 1. File Header

```typescript
// <function-name> Edge Function
// <brief description of purpose>
// Endpoint: POST /functions/v1/<function-name>
```

### 2. Imports (in order)

```typescript
// 1. External: Supabase client
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 2. Shared modules (as needed)
import {
  getBillingCorsHeaders,
  rejectDisallowedBrowserOrigin,
  requireServerSecret,
} from "../_shared/billing-security.ts";
// 3. Other _shared imports for your domain
```

### 3. Rate Limiting (copy-paste block)

```typescript
const RATE_LIMIT_MAX_REQUESTS = 10;  // adjust per function
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

### 4. Handler Structure

```typescript
Deno.serve(async (req) => {
  const corsHeaders = getBillingCorsHeaders(req);
  const requestStartedAt = Date.now();

  // 4a. Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 4b. Origin validation (block disallowed browser origins)
  const disallowedOrigin = rejectDisallowedBrowserOrigin(req);
  if (disallowedOrigin) return disallowedOrigin;

  // 4c. Rate limiting check
  if (isRateLimited(req)) {
    return new Response(
      JSON.stringify({ error: "RATE_LIMIT_EXCEEDED", message: "Too many requests" }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      }
    );
  }

  try {
    // =============================================================================
    // 1. AUTHENTICATION (if needed)
    // =============================================================================
    // ...

    // =============================================================================
    // 2. PARSE AND VALIDATE REQUEST
    // =============================================================================

    // =============================================================================
    // 3. BUSINESS LOGIC
    // =============================================================================

    // =============================================================================
    // 4. RETURN RESPONSE
    // =============================================================================
    return new Response(
      JSON.stringify({ success: true, ... }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", message: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

### 5. config.toml Entries

Each function that does NOT need JWT verification needs an explicit entry in `supabase/config.toml`:

```toml
[functions.<function-name>]
verify_jwt = false
```

See `sync-mp-plans` for an example. Billing functions (create-subscription, cancel-subscription, change-subscription) do JWT verification in-code and should NOT set `verify_jwt = false`.

### 6. Response Conventions

- **Standard error shape**: `{ success: false, error: "UPPERCASE_ERROR_CODE" }`
- **Standard success shape**: `{ success: true, ...data }`
- **Error codes are UPPERCASE_SNAKE_CASE** (e.g., `INVALID_JSON`, `PLAN_NOT_FOUND`, `MP_API_ERROR`)
- **Messages in Spanish** for user-facing errors
- **Include `correlation_id`** in responses for request tracing

## Key Shared Modules

| Module | What it provides |
|--------|-----------------|
| `_shared/billing-security.ts` | CORS headers, origin rejection, server secrets, MP webhook signature verification |
| `_shared/mp-plan-catalog.ts` | Plan catalog resolution (tier + cadence → preapproval_plan_id) |
| `_shared/mp-rollout-control.ts` | Percentage-based rollout gating for preapproval features |
| `_shared/mp-rollout-observability.ts` | Structured metric logging for preapproval create and webhook process |
| `_shared/mp-subscription-guards.ts` | Status mapping, plan mapping validation |
| `_shared/mercadopago-plan-variants.ts` | Plan variant builder (monthly/quarterly/annual from plan row) |

## Anti-patterns

- ❌ Calling `Deno.env.get()` directly for required secrets — use `requireServerSecret()`
- ❌ Returning raw `MP_ACCESS_TOKEN` or secrets in error responses
- ❌ Using `serve` from `https://deno.land/` — use built-in `Deno.serve` (Deno 2)
- ❌ Missing CORS headers on error responses
- ❌ Inconsistent error shapes (sometimes `error`, sometimes `message` at top level)
- ❌ Hardcoding `http://localhost:3000` origins — use `BILLING_ALLOWED_ORIGINS` env var instead
- ❌ One function per file with utility types defined inline rather than in _shared

## Checklist

- [ ] 3-line header comment at top of `index.ts`
- [ ] Imports ordered: external → `_shared` → local
- [ ] Rate limiting block copied with correct limits for this function
- [ ] CORS preflight handled (OPTIONS)
- [ ] `rejectDisallowedBrowserOrigin` called after OPTIONS
- [ ] `requireServerSecret` used for SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- [ ] `try/catch` wrapping entire handler
- [ ] Standard error shape `{ success: false, error: "CODE" }`
- [ ] Standard success shape `{ success: true, ...data }`
- [ ] No secrets leaked in error responses
- [ ] `config.toml` entry if `verify_jwt = false` is needed
- [ ] Structured JSON logging for key events
