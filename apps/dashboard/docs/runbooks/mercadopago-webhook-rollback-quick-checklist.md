# Mercado Pago Webhook — Rollback Quick Checklist (S5-I1)

> **Synchronized mirror (not canonical).**
> Canonical source: `docs/runbooks/mercadopago-webhook-rollback-quick-checklist.md`.

**Runbook ID:** `MP-WEBHOOK-RB-QUICK-S5-I1`  
**Reference URL:** `docs/runbooks/mercadopago-webhook-rollback-quick-checklist.md`  
**Use in alerts:** `runbook_id=MP-WEBHOOK-RB-QUICK-S5-I1`

## 1) Preconditions

- [ ] Incident commander assigned.
- [ ] Access confirmed: app config/secrets + deployment pipeline + logs/metrics.
- [ ] Last known good release/tag identified.
- [ ] Temporary customer-impact note prepared (internal status channel).

## 2) Immediate Rollback Triggers

Execute rollback **immediately** if any of the following persists for 5–10 minutes:

- [ ] Sustained spike in `signature_failed` events.
- [ ] Sustained spike in `processing_error` events.
- [ ] Webhook success rate drops below agreed SLO.
- [ ] Duplicate or missing payment status updates detected.
- [ ] Production config gate/security validation behaving unexpectedly.

## 3) Rollback Actions (Quick Sequence)

1. [ ] Announce rollback start in `#incident-payments` (include timestamp + owner).
2. [ ] Freeze new webhook-related deployments.
3. [ ] Revert to last known good release/tag.
4. [ ] Restore last known good webhook config/secrets (if changed).
5. [ ] Restart/redeploy affected webhook service(s).
6. [ ] Confirm Mercado Pago webhook endpoint is reachable and returning expected status.
7. [ ] Keep heightened monitoring enabled for at least 30 minutes.

## 4) Post-Rollback Verification

- [ ] `signature_failed` rate returned to normal baseline.
- [ ] `processing_error` rate returned to normal baseline.
- [ ] Webhook acknowledgements are stable (2xx, expected latency).
- [ ] Payment state transitions are consistent (no new duplicates/misses).
- [ ] No new critical alerts for webhook pipeline in 30 minutes.

## 5) Communication & Escalation

- [ ] Update incident channel with: rollback completed, current impact, next check time.
- [ ] Notify stakeholders: Product (Santi), Backend owner, On-call.
- [ ] If still unstable after rollback, escalate to `SEV-1` and page security/on-call leadership.
- [ ] Open follow-up RCA task and link logs/metrics snapshots.
