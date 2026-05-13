---
name: orvel-rollout-gating
description: Percentage-based rollout gating for Mercado Pago preapproval features — Supabase secret controlled, stable bucket hashing, and phased rollout runbook pattern.
triggers: changing rollout percentage, evaluating rollout, creating rollout scripts, modifying rollout control logic
---

# Orvel Rollout Gating

## When to Use

- Evaluating whether a tenant/user should access a new MP preapproval feature (e.g., create-subscription)
- Changing the rollout percentage (`MP_PREAPPROVAL_PLAN_ROLLOUT_PERCENT`)
- Running or modifying rollout/rollback scripts
- Interpreting rollout metrics in observability

## Core Mechanism

Rollout gating controls feature exposure via a **stable bucket** computed from `tenantId:userId` hash, compared against a configured percentage.

### The Gate: `evaluatePreapprovalPlanRollout()`

Defined in `_shared/mp-rollout-control.ts`.

```typescript
const decision = evaluatePreapprovalPlanRollout({
  tenantId: business.owner_id,
  userId: user?.id || business.owner_id,
  environment: "production",
});

if (!decision.allowed) {
  // Return 503 ROLLOUT_BLOCKED
}
```

### How It Works

1. **Non-production bypass**: If environment !== "production", always allowed (100%)
2. **Read secret**: `MP_PREAPPROVAL_PLAN_ROLLOUT_PERCENT` from `Deno.env`
3. **Validate**: Only `0`, `10`, `50`, `100` are valid — any other value fails **closed**
4. **Compute bucket**: `hash(tenantId:userId) % 100` — stable, deterministic
5. **Decide**: `allowed = bucket < rolloutPercent`

### Stable Bucket Algorithm

```typescript
function computeStableBucket(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % 100;
}
```

Key: `key = `${input.tenantId}:${input.userId}`` — a tenant-user pair always gets the same bucket.

## Valid Percentages

| Value | Meaning | Use Case |
|-------|---------|----------|
| `0` | **Off** — feature disabled for everyone | Rollback / initial state |
| `10` | **Canary** — 10% of tenants | Initial rollout, observe metrics |
| `50` | **Half** — 50% of tenants | Expanded rollout |
| `100` | **Full** — everyone | Full release |

**Any other value causes fail-closed** (treated as 0, `configValid: false`).

## Rollout Scripts

Located in `scripts/rollout/`:

### Promote: `mp-preapproval-plan-rollout.sh`

```bash
./scripts/rollout/mp-preapproval-plan-rollout.sh <10|50|100>
```

Uses `supabase secrets set` (Supabase CLI). Only 10, 50, 100 are valid promotion targets.

### Rollback: `mp-preapproval-plan-rollback.sh`

```bash
./scripts/rollout/mp-preapproval-plan-rollback.sh <50|10|0>
```

Allows rollback to 50, 10, or 0.

## Observability

### Metric: `mp_preapproval_create_result`

Logged via `recordPreapprovalCreateMetric()` in `_shared/mp-rollout-observability.ts`.

Key fields in the structured JSON log:

| Field | Description |
|-------|-------------|
| `metric` | `mp_preapproval_create_result` |
| `tenant_id` | Tenant identifier |
| `rollout_percent` | Current rollout setting |
| `rollout_bucket` | The stable bucket (0-99) |
| `result` | `success` / `error` / `blocked` |
| `retryable` | Whether the error is retryable |
| `latency_ms` | Request latency |
| `latency_bucket` | `lt_500ms` / `lt_1000ms` / `lt_2500ms` / `gte_2500ms` |
| `http_status` | HTTP response status code |

### Metric: `mp_webhook_process_result`

Logged via `recordWebhookProcessMetric()` with similar structure using `metric: mp_webhook_process_result`.

## Phased Rollout Runbook Pattern

The canonical runbook is at `docs/runbooks/mp-preapproval-plan-sprint3-operational-runbook.md`.

### Phases

| Phase | Percent | Hold Time | Go Criteria |
|-------|---------|-----------|-------------|
| 1 | 10% | 30 min | Success ≥ 99.0%, Retryable ≤ 1.0%, p95 < 2500ms, 0 payload_conflicts |
| 2 | 50% | 60 min | Same + stricter |
| 3 | 100% | 2h monitoring | Success ≥ 99.5%, Retryable ≤ 0.5%, p95 < 2000ms |

### Go/No-Go Decision

Each gate requires:
- Contract tests passing
- Canary metrics satisfying thresholds
- No growth in webhook duplicates or conflicts
- Evidence package documented

### Rollback Triggers

Initiate rollback when any condition persists for **10 minutes**:
- Success rate < **98.5%**
- Retryable errors > **2.0%**
- p95 latency ≥ **2500ms**
- Any `payload_conflict` idempotency event

Step-down: 50% → 10% → 0%.

## Fail-Closed Behavior

When config is invalid:
```typescript
console.error(JSON.stringify({
  event: "security_rollout_config_invalid",
  severity: "high",
  control: "MP_PREAPPROVAL_PLAN_ROLLOUT_PERCENT",
  enforced_rollout_percent: 0,
  behavior: "fail_closed",
}));
```

The system:
- Treats invalid config as `rolloutPercent: 0`
- Sets `configValid: false`
- Logs a `security_rollout_config_invalid` event at `severity: "high"`
- Blocks all traffic

## Anti-patterns

- ❌ Using percentages outside {0, 10, 50, 100} — the system fails closed
- ❌ Using non-deterministic bucket assignment (e.g., random) — breaks stable canary
- ❌ Skipping rollout check in non-production environments — allowed by design but remove bypass for staging if needed
- ❌ Merging rollout changes without updating the rollout runbook
- ❌ Setting rollout to 100% without running the full phased runbook
- ❌ Using `Math.random()` or `crypto.getRandomValues()` for bucket assignment

## Checklist

- [ ] `MP_PREAPPROVAL_PLAN_ROLLOUT_PERCENT` is set to 0 before initial deployment
- [ ] Rollout evaluation happens before any MP API call
- [ ] `recordPreapprovalCreateMetric` is called on every code path (success, error, blocked)
- [ ] Stable bucket uses `tenantId:userId` format
- [ ] Scripts in `scripts/rollout/` are executable (`chmod +x`)
- [ ] Runbook is updated with current gate criteria
- [ ] On-call team knows the rollback procedure
- [ ] Evidence package template is ready for gates
