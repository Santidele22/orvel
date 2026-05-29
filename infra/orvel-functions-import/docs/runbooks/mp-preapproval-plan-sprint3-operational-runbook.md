# MP preapproval_plan — Sprint 3 Operational Runbook (PR #145)

> **Canonical source of truth.**
> Mirror file for dashboard docs: `dashboard/docs/runbooks/mp-preapproval-plan-sprint3-operational-runbook.md`.

**Runbook ID:** `MP-PREAPPROVAL-SPRINT3-OPS-RB`  
**Reference URL:** `docs/runbooks/mp-preapproval-plan-sprint3-operational-runbook.md`  
**Related PR:** `#145` (`feat/sprint3-rollout-controls`)

---

## 1) Rollout procedure (10% → 50% → 100%)

### Preconditions (before 10%)

- [ ] Bruno gate evidence attached for current phase (tests green + canary metrics snapshot).
- [ ] No unresolved `SEV-1`/`SEV-2` incidents in payments path.
- [ ] On-call roles assigned (IC, Backend owner, QA owner).
- [ ] Supabase CLI auth verified for secrets update.

### Promote to 10%

```bash
./scripts/rollout/mp-preapproval-plan-rollout.sh 10
```

Hold canary for **minimum 30 minutes** and collect metrics from:
- `mp_preapproval_create_result`
- `mp_webhook_process_result`

### Promote 10% → 50%

Allowed only if Go criteria hold for the full observation window:
- Success rate ≥ **99.0%**
- Retryable errors ≤ **1.0%**
- p95 latency < **2500 ms**
- `payload_conflict` idempotency events = **0**

```bash
./scripts/rollout/mp-preapproval-plan-rollout.sh 50
```

Hold canary for **minimum 60 minutes**.

### Promote 50% → 100%

Allowed only if Go criteria hold for the full observation window:
- Success rate ≥ **99.5%**
- Retryable errors ≤ **0.5%**
- p95 latency < **2000 ms**
- `payload_conflict` idempotency events = **0**

```bash
./scripts/rollout/mp-preapproval-plan-rollout.sh 100
```

Intensified monitoring for **2 hours** post-promotion.

---

## 2) Go/No-Go checklist (aligned with Bruno gates)

Use this checklist **at each gate** (10%, 50%, 100%):

### Go checklist

- [ ] Contract tests for Sprint 3 rollout controls pass (including rollout/rollback scripts and observability contracts).
- [ ] No flaky test reruns used to force green.
- [ ] Canary metrics satisfy phase thresholds.
- [ ] No growth trend in webhook duplicates or idempotency conflicts.
- [ ] Evidence package completed and linked in PR #145.

### No-Go checklist

- [ ] Any gate test failing or unstable.
- [ ] Success rate below threshold for >10 min.
- [ ] `payload_conflict` observed (count > 0) in current window.
- [ ] p95 latency above phase threshold for >10 min.
- [ ] Incident commander requests hold due to external dependency instability.

If any No-Go item is true: **do not promote traffic** and execute rollback decision flow.

---

## 3) Rollback procedure (50 → 10 → 0) with decision thresholds

### Trigger thresholds

Initiate rollback when one or more conditions persist for **10 minutes**:
- Success rate < **98.5%**
- Retryable errors > **2.0%**
- p95 latency ≥ **2500 ms**
- Any `payload_conflict` idempotency event
- Elevated `mp_webhook_process_result` errors with customer-facing failures

### Step-down sequence

1. **50% → 10%**
   ```bash
   ./scripts/rollout/mp-preapproval-plan-rollback.sh 10
   ```
   Observe 15 minutes.

2. **10% → 0%** (full stop)
   ```bash
   ./scripts/rollout/mp-preapproval-plan-rollback.sh 0
   ```
   Keep at 0% until incident is mitigated and Bruno re-validates gate criteria.

> Emergency fast path: if customer impact is severe, rollback directly to 0%.

---

## 4) Incident response and escalation matrix

| Severity | Signal | Owner (primary) | Escalate to | SLA |
|---|---|---|---|---|
| SEV-3 | Minor latency drift, no customer impact | Backend on-call | QA owner (Bruno gate validator) | 30 min |
| SEV-2 | Threshold breach with partial checkout failures | Incident Commander | Product owner (Santi) + Backend lead | 15 min |
| SEV-1 | Widespread subscription creation failure / data integrity risk | Incident Commander | Santi + Backend lead + Security on-call | Immediate |

### Incident command flow

1. Declare incident in `#incident-payments` with runbook ID.
2. Freeze promotions (no 10→50 or 50→100 while incident open).
3. Execute rollback level by severity.
4. Publish status every 15 minutes until stable.
5. Close with evidence and follow-up RCA task.

---

## 5) Evidence package template (required at every gate)

Copy this template into PR comment or runbook log before each promotion decision:

```md
### Sprint 3 Gate Evidence — [10% | 50% | 100%]

- Timestamp (UTC):
- Decision: [GO | NO-GO]
- Current rollout percent:
- Proposed next step:

#### Bruno Gate Validation
- Contract tests status:
- Test run link/artifact:
- Flaky rerun used?: [No/Yes + justification]

#### Canary Metrics Window
- Window start/end:
- Success rate:
- Retryable error rate:
- p95 latency:
- p99 latency:
- `payload_conflict` count:
- Duplicate webhook count:

#### Operational Notes
- Active incidents:
- Customer impact observed:
- Risk notes:

#### Approvals
- QA (Bruno gate owner):
- Backend on-call:
- Incident Commander:
- Product approval (Santi) [required for 50→100]:
```

---

## 6) Command quick reference

```bash
# Promotions
./scripts/rollout/mp-preapproval-plan-rollout.sh 10
./scripts/rollout/mp-preapproval-plan-rollout.sh 50
./scripts/rollout/mp-preapproval-plan-rollout.sh 100

# Rollbacks
./scripts/rollout/mp-preapproval-plan-rollback.sh 50
./scripts/rollout/mp-preapproval-plan-rollback.sh 10
./scripts/rollout/mp-preapproval-plan-rollback.sh 0
```
