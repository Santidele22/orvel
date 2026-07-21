---
name: orvel-mercadopago-subscriptions
description: Mercado Pago Subscriptions integration patterns for orvel-functions — preapproval_plan and preapproval APIs, plan catalog resolution, webhook handling, and status machine.
triggers: working with subscription creation, cancellation, changes, webhooks, plan sync
---

# Orvel Mercado Pago Subscriptions

## When to Use

- Creating or modifying subscription-related Edge Functions (`create-subscription`, `cancel-subscription`, `change-subscription`)
- Working with the Mercado Pago webhook handler (`mercadopago-webhook`)
- Syncing plans via `sync-mp-plans`
- Running billing reconciliation (`billing-reconciliation`)

> ⚠️ This project uses **Mercado Pago Subscriptions** (preapproval_plan + preapproval APIs), NOT Checkout Pro or other MP products.

## Key Concepts

### Mercado Pago APIs Used

| API | Endpoint | Purpose |
|-----|----------|---------|
| `preapproval_plan` | `POST /preapproval_plan` | Create plan templates (amount, frequency, billing_day, trial) |
| `preapproval` | `POST /preapproval` | Create subscriptions linking a plan to a payer |
| `preapproval` | `GET /preapproval/:id` | Verify subscription status (server-truth) |
| `preapproval` | `PUT /preapproval/:id` | Update subscription (pause, cancel) |
| `payments` | `GET /v1/payments/:id` | Verify individual payment status |

### Subscription Status Machine

```
authorized → pending → active → paused → canceled
                            ↘ past_due
```

Status mapping via `mapWebhookStatusToSubscriptionStatus()` in `_shared/mp-subscription-guards.ts`:

| MP Status | Internal Status | Notes |
|-----------|----------------|-------|
| `authorized` (preapproval) | `pending` | Mandate approved, waiting for first payment |
| `approved` (payment) | `active` | Payment confirmed |
| `paused` | `paused` | Subscription paused |
| `cancelled` / `canceled` | `canceled` | Subscription terminated |
| `rejected` | `canceled` | Payment rejected |
| default | `pending` | Fallback |

### external_reference

The `external_reference` field links MP subscriptions to Orvel's billing system. Format:

```
checkout-session:<idempotency_hash>
```

This is created in `create-subscription/index.ts` as:
```typescript
const externalReference = `checkout-session:${idempotencySuffix}`;
```

## Plan Catalog Resolution

### Tier + Cadence → preapproval_plan_id

Plans are resolved via `_shared/mp-plan-catalog.ts` using normalized tiers and cadences:

| Tier (aliases) | Normalized |
|---------------|-----------|
| `started`, `starter` | `started` |
| `medium`, `growth` | `medium` |
| `pro` | `pro` |

| Cadence | Normalized |
|---------|-----------|
| `monthly` | `monthly` |
| `quarterly` | `quarterly` |
| `annual` | `annual` |

Resolution flow:
1. Normalize tier + cadence with `normalizeTier()` / `normalizeCadence()`
2. Query `mp_plan_catalog` table matching normalized values
3. Use `resolvePlanCatalogRow()` to find the correct row
4. Extract `preapproval_plan_id` for the MP API call

### Plan Variants

Use `_shared/mercadopago-plan-variants.ts` to build variant arrays:

```typescript
const variants = buildMercadoPagoPlanVariants(planRow);
// Returns: [{ cadence: 'monthly', frequency: 1, transactionAmount: 14999, ... }, ...]
```

## Creating Subscriptions

### Flow (create-subscription/index.ts)

1. **Parse request** — `plan_code` or `{tier, cadence}` pair
2. **Lookup plan** — from `plans` table by `code`
3. **Free plan path** — insert directly into `business_subscriptions` with status `active`
4. **Paid plan path**:
   a. Evaluate rollout gating (`evaluatePreapprovalPlanRollout`)
   b. Create `billing_checkout_sessions` row with `external_reference`
   c. Build MP preapproval request with `payer_email`, `back_url`, `reason`, `external_reference`, `auto_recurring`
   d. `POST /preapproval` to MP
   e. Save subscription as `pending` in `business_subscriptions`
   f. Return `init_point` for frontend redirect

### MP Preapproval Request Shape

```typescript
const mpPreapprovalRequest = {
  payer_email: payerEmail,
  back_url: `${FRONTEND_URL}/auth/signup/credentials?plan=${plan.code}`,
  reason: `${plan.name} - Orvel`,
  external_reference: externalReference,
  status: "pending",
  auto_recurring: {
    frequency: plan.billing_frequency || 1,
    frequency_type: plan.billing_frequency_type || "months",
    transaction_amount: Number(plan.price),
    currency_id: plan.currency || "ARS",
  },
};
```

## Webhook Handling

### Flow (mercadopago-webhook/index.ts)

1. **Signature verification** — `verifyMercadoPagoWebhookSignature(req, body)` from `_shared/billing-security.ts`
2. **Idempotency** — check `payment_webhook_events` and `mp_webhook_events` tables
3. **Server-truth verification** — call MP API to verify status (never trust webhook payload alone)
4. **Status mapping** — `mapWebhookStatusToSubscriptionStatus(eventType, mpStatus)` from `_shared/mp-subscription-guards.ts`
5. **Update subscription** — `apply_subscription_event_transition` RPC
6. **Insert payment** — if event is a payment with amount > 0
7. **Sync entitlements** — if status becomes active or payment approved

### Signature Verification

Mercado Pago sends `x-signature` header with `ts` and `v1` fields. Verification happens in `billing-security.ts`:

```typescript
const isValid = await verifyMercadoPagoWebhookSignature(req, body);
```

Uses HMAC-SHA256 with `MP_WEBHOOK_SECRET` and the manifest: `id:<dataId>;request-id:<requestId>;ts:<ts>;`

### Event Types

| eventType | Meaning | resourceId lookup |
|-----------|---------|-------------------|
| `payment` | Individual payment event | `/v1/payments/{id}` |
| `preapproval` | Subscription status change | `/preapproval/{id}` |
| `subscription_preapproval` | Alternative preapproval event | `/preapproval/{id}` |

## Cancelling Subscriptions

### Flow (cancel-subscription/index.ts)

1. Verify auth + business ownership
2. Get current active subscription
3. If not already cancelled, set status to `cancelled`
4. Cancel immediately (no MP subscription) or schedule for period end (has MP active)
5. **Do NOT cancel in MP** — let the subscription expire naturally per business requirements

## Changing Subscriptions

### Flow (change-subscription/index.ts)

Three cases:
- **Downgrade**: Set `scheduled_change` + `cancel_at_period_end`, pause in MP
- **Upgrade**: Create new preapproval in MP, return `init_point`, set status to `pending`
- **Same tier**: Just update `plan_code`

## Anti-patterns

- ❌ Trusting webhook payload without server-truth verification via MP API
- ❌ Using Checkout Pro instead of preapproval/preapproval_plan APIs
- ❌ Hardcoding tier/cadence values instead of using `normalizeTier()`/`normalizeCadence()`
- ❌ Calling MP API without idempotency key support
- ❌ Exposing `MP_ACCESS_TOKEN` in responses or logs
- ❌ Missing `external_reference` on preapproval requests
- ❌ Using test vs production `init_point` without checking `TEST-` token prefix

## Secrets Required

| Secret | Used In | Purpose |
|--------|---------|---------|
| `MP_ACCESS_TOKEN` | All billing functions | Mercado Pago API auth |
| `MP_WEBHOOK_SECRET` | mercadopago-webhook | Webhook signature verification |
| `MP_PREAPPROVAL_PLAN_ROLLOUT_PERCENT` | create-subscription | Rollout gating (see rollout gating skill) |
| `FRONTEND_URL` | create-subscription, change-subscription | Back URL for MP redirect |
| `SUPABASE_URL` | All functions | Database access |
| `SUPABASE_SERVICE_ROLE_KEY` | All functions | Admin DB access |

## Checklist

- [ ] Plan is resolved from `plans` table or `mp_plan_catalog`
- [ ] Free plan path handled separately (no MP call)
- [ ] `external_reference` in `checkout-session:<hash>` format
- [ ] Rollout gating checked before MP call (create-subscription only)
- [ ] Idempotency key support (if provided by client)
- [ ] `init_point` correctly selected (test vs production)
- [ ] Webhook signature verified before processing
- [ ] Server-truth verified via MP API on webhook
- [ ] Status correctly mapped via `mapWebhookStatusToSubscriptionStatus`
- [ ] Metric logged via `recordPreapprovalCreateMetric` / `recordWebhookProcessMetric`
- [ ] Error sanitized via `sanitizeMercadoPagoError` (no raw MP error exposed)
