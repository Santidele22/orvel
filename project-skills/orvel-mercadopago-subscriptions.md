---
name: orvel-mercadopago-subscriptions
description: Mercado Pago Subscriptions integration using preapproval_plan + preapproval APIs for recurring billing, with plan catalog, webhook handling, rollout gating, and observability.
triggers: "mercadopago, mercado pago, subscription, preapproval, preapproval_plan, recurring billing, mp plan catalog, webhook, payment webhook, mp signature, rollout gating, canary rollout, billing, payment"
---

# Orvel MercadoPago Subscriptions

## Purpose
Define how the Orvel dashboard integrates with Mercado Pago Subscriptions (recurring billing via `preapproval_plan` + `preapproval` APIs). This is NOT about Checkout-Pro (one-time payments). Focus areas: plan catalog resolution, preapproval creation, webhook handling (signature verification, status mapping, idempotency), rollout gating with percentage-based bucket assignment, and structured observability.

## When to Use
- Creating or modifying subscription billing flows
- Working with Mercado Pago preapproval API
- Handling subscription webhooks from Mercado Pago
- Implementing rollout gating for new billing features
- Adding observability to subscription/payment flows
- Reconciling subscription state between local DB and Mercado Pago
- Building or modifying the plan catalog (tier + cadence mapping)
- Working with subscription state machine transitions

## Mandatory Rules

### 1. Subscriptions API (Not Checkout-Pro)
Orvel uses Mercado Pago's **Subscriptions** API:
- **Preapproval**: `POST /preapproval` — creates a subscription mandate.
- **Preapproval Plan**: `POST /preapproval_plan` — defines recurring billing template (used for plan catalog sync).
- The flow is: plan catalog → preapproval creation → user authorizes → webhook confirms → activate.
- `card_token_id` is used when the user provides card details directly.
- Subscription statuses from MP: `authorized`, `pending`, `approved`, `rejected`, `cancelled`, `paused`.

### 2. Plan Catalog Resolution
The `_shared/mp-plan-catalog.ts` module provides tier+cadence mapping:

```typescript
export type BillingTier = 'started' | 'medium' | 'pro';
export type BillingCadence = 'monthly' | 'quarterly' | 'annual';
```

- `normalizeTier(tier)`: Maps aliases (`starter`→`started`, `growth`→`medium`).
- `normalizeCadence(cadence)`: Validates `monthly`/`quarterly`/`annual`.
- `buildTierCode(tier, cadence)`: Produces canonical codes like `STARTED_MONTHLY`.
- `resolvePlanCatalogRow(rows, tier, cadence)`: Matches DB rows by tier+cadence or tier_code.
- The `mp_plan_catalog` DB table is the source of truth for `preapproval_plan_id` mappings.

### 3. Subscription Creation Flow (`create-subscription` Edge Function)
The `create-subscription` edge function (`POST /functions/v1/create-subscription`) follows this flow:

1. **CORS**: Handle OPTIONS preflight via `getBillingCorsHeaders(req)`.
2. **Origin validation**: `rejectDisallowedBrowserOrigin(req)`.
3. **Rate limiting**: Per-IP rate limit (10 requests/60s) with `Map<string, number[]>`.
4. **Auth**: Optional JWT verification via `Authorization` header.
5. **Plan resolution**: Accept `{plan_code}` or `{tier, cadence}` → resolve to catalog row.
6. **Free plan bypass**: If `plan.price === 0`, create subscription directly in DB.
7. **Rollout gate**: `evaluatePreapprovalPlanRollout()` before calling MP API.
8. **Checkout session**: Create `billing_checkout_sessions` row with idempotency key.
9. **MP preapproval**: `POST /api.mercadopago.com/preapproval` with `auto_recurring`, `payer_email`, `back_url`.
10. **Response**: Return `init_point` for user redirect to MP.

### 4. Webhook Handling
The `mercadopago-webhook` edge function processes subscription events:

**Security:**
- Parse `x-signature` header (format: `ts=...;v1=...`).
- Verify signature via HMAC-SHA256 with `MP_WEBHOOK_SECRET`.
- Check timestamp within 5-minute tolerance window (replay protection).

**Signature verification** (in `_shared/billing-security.ts`):
```typescript
const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
const expectedSignature = await hmacSha256Hex(webhookSecret, manifest);
return timingSafeEqualHex(v1.toLowerCase(), expectedSignature);
```

**Idempotency:**
- Use `payment_webhook_events` table as a ledger (reserve pattern).
- `registerIfFirstSeen()` → `'reserved'`, `'duplicate'`, or `'payload_conflict'`.
- Duplicates with matching payload hash → return 200 with `IGNORE_DUPLICATE`.
- Duplicates with mismatched payload hash → return 409 `PAYLOAD_CONFLICT`.

**Status mapping** (in `_shared/mp-subscription-guards.ts`):
```typescript
export function mapWebhookStatusToSubscriptionStatus(eventType: string, mpStatus: string): "active" | "pending" | "paused" | "canceled" {
  if (normalizedStatus === "paused") return "paused";
  if (["cancelled", "canceled", "rejected"].includes(normalizedStatus)) return "canceled";
  if (normalizedStatus === "approved") return "active";
  if (normalizedStatus === "authorized") return "pending"; // Wait for payment
  return "pending";
}
```

### 5. Subscription State Machine
`subscription-state-machine.api.ts` implements a pure state machine for subscription transitions:

**Statuses**: `trialing | active | past_due | paused | canceled | expired | scheduled_change`

**Events** (from MP webhooks):
- `subscription.authorized` → ACTIVATE (status: active)
- `subscription.payment_approved` → RENEW (status: active, new period)
- `subscription.payment_rejected` → MARK_PAST_DUE (status: past_due)
- `subscription.cancelled` → CANCEL_NOW (status: canceled)
- `subscription.paused` → PAUSE (status: paused)
- `subscription.plan_changed` → APPLY_PLAN_CHANGE (status: active, new plan)

**Rules:**
- Out-of-order events (older than current billing period) are ignored.
- Terminal states (canceled, expired) cannot transition.
- Repository pattern: `configureSubscriptionTransitionRepository()` for persistence.

### 6. Rollout Gating
New billing features use percentage-based rollout:

```typescript
export function evaluatePreapprovalPlanRollout(input: PreapprovalRolloutInput): PreapprovalRolloutDecision {
  // Non-production is always allowed
  // Production: compute stable bucket from tenantId:userId
  // bucket < rolloutPercent → allowed
}
```

- Valid percentages: `0, 10, 50, 100` (from `MP_PREAPPROVAL_PLAN_ROLLOUT_PERCENT` env var).
- Stable bucket assignment: hash of `tenantId:userId` modulo 100.
- Invalid config → `{ value: 0, valid: false }` + security alert log.
- Rollout gate is evaluated BEFORE any MP API call.

### 7. Observability (Structured JSON Metrics)
Use structured JSON logs (not just `console.log` strings):

**Preapproval create metric** (`mp_preapproval_create_result`):
- `tenant_id`, `actor_correlation_id` (opaque hash, never `user_id`)
- `rollout_percent`, `rollout_bucket`
- `result`: `success` | `error` | `blocked`
- `retryable`, `idempotency_decision`
- `latency_ms`, `latency_bucket`, `http_status`

**Webhook process metric** (`mp_webhook_process_result`):
- `provider_event_id`, `result`, `retryable`
- `idempotency_decision`, `latency_ms`, `latency_bucket`
- `webhook_success`, `http_status`

**Security-sensitive metadata is automatically redacted** (secrets, tokens, signatures).

### 8. Reconciliation (Dry-Run)
`reconciliation.api.ts` provides dry-run reconciliation between local DB and MP:
- `createSupabaseReconciliationRepository(supabase)` → calls `reconcile_mercadopago_subscriptions_dry_run` RPC.
- Only dry-run is enabled from dashboard frontend contracts.
- Drift types: `LOCAL_ACTIVE_REMOTE_CANCELLED`, `LOCAL_PAST_DUE_REMOTE_AUTHORIZED`, `PERIOD_MISMATCH`, `PLAN_MISMATCH`.

## Anti-Patterns

- ❌ **Using Checkout-Pro APIs for subscriptions** — use preapproval/preapproval_plan endpoints.
- ❌ **Skipping signature verification on webhooks** — always verify `x-signature` with HMAC.
- ❌ **Storing raw user_id in observability metrics** — use opaque `actor_correlation_id`.
- ❌ **Calling MP API before rollout gate check** — rollout gate must come first.
- ❌ **Ignoring out-of-order webhook events** — the state machine handles ordering.
- ❌ **Hard-coding plan → preapproval_plan_id mappings** — always use `mp_plan_catalog` resolution.
- ❌ **Processing duplicate webhooks without idempotency** — use the ledger pattern.
- ❌ **Exposing MP access tokens or webhook secrets in client-side code**.

## Examples

### Creating a Subscription (Frontend)
```typescript
import { createSubscription } from '../core/payments/subscriptions/create-subscription.api';

try {
  const result = await createSubscription({ planCode: 'GROWTH' });
  if (result.ok && result.initPoint) {
    window.location.href = result.initPoint; // Redirect to MP
  }
} catch (error) {
  if (error.code === 'RATE_LIMITED') {
    // Show "too many attempts" message
  }
}
```

### Handling a Webhook (Edge Function)
```typescript
// In mercadopago-webhook/index.ts
const signatureHeader = req.headers.get('x-signature');
const rawBody = await req.text();

if (!(await verifyMercadoPagoWebhookSignature(req, rawBody))) {
  return new Response(JSON.stringify({ error: 'INVALID_SIGNATURE' }), { status: 401 });
}

// Process the webhook...
```

### Evaluating Rollout Gate
```typescript
import { evaluatePreapprovalPlanRollout } from '../_shared/mp-rollout-control.ts';

const decision = evaluatePreapprovalPlanRollout({
  tenantId: business.owner_id,
  userId: user.id,
  environment: 'production',
});

if (!decision.allowed) {
  return new Response(JSON.stringify({ error: 'ROLLOUT_BLOCKED' }), { status: 503 });
}
```

## Checklist
- [ ] Subscription uses preapproval API, not Checkout-Pro
- [ ] Plan catalog resolves tier+cadence to preapproval_plan_id
- [ ] Rollout gate evaluated before any MP API call
- [ ] Webhook signature verified with HMAC-SHA256 (not just format check)
- [ ] Idempotency ledger prevents duplicate processing
- [ ] State machine correctly maps webhook events to transitions
- [ ] Observability metrics use opaque actor_correlation_id (not user_id)
- [ ] Reconciliation supports dry-run only from client contracts
- [ ] Error responses include deterministic error codes (MP_API_ERROR, ROLLOUT_BLOCKED, etc.)
