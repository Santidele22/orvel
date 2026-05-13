---
name: orvel-runbook-standard
description: Standard template and conventions for production runbooks in orvel-functions — metadata header, phased gates with Go/Kill criteria, preconditions, verification, and mirror file convention.
triggers: creating a new runbook, updating an existing runbook, planning a rollout, documenting an incident response procedure
---

# Orvel Runbook Standard

## When to Use

- Creating a new operational runbook for a feature rollout
- Documenting an incident response/rollback procedure
- Updating an existing runbook with new gate criteria or contacts
- Reviewing a runbook for completeness

## Runbook Locations

Runbooks live in `docs/runbooks/`:

```
docs/runbooks/
├── mercadopago-webhook-rollback-quick-checklist.md        # Quick rollback checklist
└── mp-preapproval-plan-sprint3-operational-runbook.md     # Full phased rollout runbook
```

### Mirror File Convention

Runbooks in `orvel-functions/docs/runbooks/` may be mirrored to `orvel-dashboard/docs/runbooks/`. The canonical source is **orvel-functions**.

When mirroring, include a comment at the top:

```markdown
> **Canonical source of truth.**
> Mirror file for dashboard docs: `dashboard/docs/runbooks/<runbook-filename>`.
```

## Runbook Template

### 1. Metadata Header

Every runbook must have a header block:

```markdown
# <Title> — <Subtitle>

> **Canonical source of truth.**
> Mirror file for dashboard docs: `dashboard/docs/runbooks/<filename>`.

**Runbook ID:** `<UNIQUE-ID>`  
**Reference URL:** `docs/runbooks/<filename>`  
**Related PR:** `#<PR-number>`
```

**Runbook ID format**: `<SYSTEM>-<FEATURE>-RB-<SUFFIX>`
- Examples: `MP-PREAPPROVAL-SPRINT3-OPS-RB`, `MP-WEBHOOK-RB-QUICK-S5-I1`

### 2. Sections (in order)

#### 1) Procedure (Rollout / Main Action)

For phased rollouts, structure by phase:

```markdown
## 1) Rollout procedure (10% → 50% → 100%)

### Preconditions (before 10%)

- [ ] Bruno gate evidence attached for current phase (tests green + canary metrics snapshot).
- [ ] No unresolved `SEV-1`/`SEV-2` incidents in <affected path>.
- [ ] On-call roles assigned (IC, Backend owner, QA owner).
- [ ] <CLI or tooling> auth verified for secrets update.

### Promote to X%

```bash
<script-path> <args>
```

Hold canary for **minimum N minutes** and collect metrics from:
- `<metric-1>`
- `<metric-2>`
```

#### 2) Go/No-Go Checklist

```markdown
## 2) Go/No-Go checklist

Use this checklist **at each gate** (X%, Y%, Z%):

### Go checklist

- [ ] <condition 1>
- [ ] <condition 2>

### No-Go checklist

- [ ] <condition 1>
- [ ] <condition 2>

If any No-Go item is true: **do not promote traffic** and execute rollback decision flow.
```

#### 3) Rollback Procedure

```markdown
## 3) Rollback procedure (<N> → <M> → <P>) with decision thresholds

### Trigger thresholds

Initiate rollback when one or more conditions persist for **N minutes**:
- <condition 1>
- <condition 2>

### Step-down sequence

1. **N% → M%**
   ```bash
   <script> <arg>
   ```
   Observe X minutes.

2. **M% → P%** (full stop)
   ```bash
   <script> <arg>
   ```
   Keep at P% until incident is mitigated.

> Emergency fast path: if customer impact is severe, rollback directly to P%.
```

#### 4) Incident Response and Escalation Matrix

```markdown
## 4) Incident response and escalation matrix

| Severity | Signal | Owner (primary) | Escalate to | SLA |
|----------|--------|-----------------|-------------|-----|
| SEV-3 | <minor issue> | <role> | <role> | 30 min |
| SEV-2 | <threshold breach> | <role> | <role> | 15 min |
| SEV-1 | <critical issue> | <role> | <role> | Immediate |

### Incident command flow

1. Declare incident in `<channel>` with runbook ID.
2. Freeze promotions (no <X→Y> or <Y→Z> while incident open).
3. Execute rollback level by severity.
4. Publish status every N minutes until stable.
5. Close with evidence and follow-up RCA task.
```

#### 5) Evidence Package Template

```markdown
## 5) Evidence package template (required at every gate)

Copy this template into PR comment or runbook log before each promotion decision:

```md
### <Gate Name> Gate Evidence — [X% | Y% | Z%]

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
- <conflict> count:
- Duplicate <event> count:

#### Operational Notes
- Active incidents:
- Customer impact observed:
- Risk notes:

#### Approvals
- QA (Bruno gate owner):
- Backend on-call:
- Incident Commander:
- Product approval (Santi) [required for <high-risk promotion>]:
```
```

#### 6) Command Quick Reference

```markdown
## 6) Command quick reference

```bash
# Promotions
<script> <arg1>
<script> <arg2>
<script> <arg3>

# Rollbacks
<script> <arg1>
<script> <arg2>
<script> <arg3>
```
```

## Existing Runbook Examples

### Full Rollout Runbook

`docs/runbooks/mp-preapproval-plan-sprint3-operational-runbook.md`
- **ID**: `MP-PREAPPROVAL-SPRINT3-OPS-RB`
- **Pattern**: Phased rollout (10% → 50% → 100%) with Go/Kill gates
- **Metrics**: `mp_preapproval_create_result`, `mp_webhook_process_result`
- **Incident severity table**: SEV-1/SEV-2/SEV-3 with owners and SLAs
- **Evidence template**: Gate evidence with Bruno validation, canary metrics, approvals

### Quick Rollback Checklist

`docs/runbooks/mercadopago-webhook-rollback-quick-checklist.md`
- **ID**: `MP-WEBHOOK-RB-QUICK-S5-I1`
- **Pattern**: Immediate rollback triggers → quick sequence → post-rollback verification → communication
- **Focus**: Speed — minimal sections, actionable checklist format
- **Trigger signals**: `signature_failed` spike, `processing_error` spike, success rate drop

## Anti-patterns

- ❌ Runbooks without a unique ID — every runbook must have `Runbook ID:` in the header
- ❌ Runbooks without trigger thresholds — must define when to execute the procedure
- ❌ Missing escalation contacts — every runbook needs owner and escalation paths
- ❌ Outdated mirror files — when updating canonical file, update the mirror in dashboard docs too
- ❌ Runbooks without precondition checklists — every procedure needs preconditions
- ❌ Forgetting to link the PR number — every runbook documents a specific change
- ❌ Single-section runbooks — use the full template even for quick procedures

## Checklist

- [ ] Runbook has a unique `Runbook ID:` in the header
- [ ] Runbook has `Reference URL:` pointing to `docs/runbooks/<filename>`
- [ ] Runbook has `Related PR:` linking to the implementation PR
- [ ] Preconditions are listed as checkboxes
- [ ] Each phase has minimum hold time specified
- [ ] Go criteria are quantitative (e.g., success rate ≥ 99.0%)
- [ ] No-Go criteria are explicit
- [ ] Rollback procedure has step-down sequence
- [ ] Rollback trigger thresholds are quantitative
- [ ] Incident severity matrix includes owners, escalation, and SLAs
- [ ] Evidence package template is included
- [ ] Command quick reference is included
- [ ] Mirror file header comment (if mirroring to dashboard)
- [ ] All metric names referenced exist in the codebase
