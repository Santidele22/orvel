# runbook-refresh Specification

## Purpose

Implements WU3: archive, mark-historical, trim, or delete four runbooks so `docs/runbooks/*` does not contradict current code (501 stub, completed migration, outbox/MP purge, removed trial-reminder cron).

## Requirements

### Requirement: REQ-RR-1 — Archive account-closure runbook

`docs/runbooks/account-closure.md` MUST be moved to `docs/runbooks/archive/2026-08-12-account-closure.md` with a header `status: archived, function → 501 stub per release-2.0`.

Status: draft

#### Scenario: Moved with archived header

- GIVEN `docs/runbooks/account-closure.md`
- WHEN an implementer runs `ls docs/runbooks/archive/2026-08-12-account-closure.md`
- THEN the file exists at the archive path
- AND its header states `status: archived` with the 501-stub function note
- AND `docs/runbooks/account-closure.md` no longer exists

### Requirement: REQ-RR-2 — Mark monorepo-migration runbook historical

`docs/runbooks/monorepo-migration.md` MUST carry a header `status: historical, migration complete` and MUST NOT describe an active source-repo workflow.

Status: draft

#### Scenario: Historical marker, no active workflow

- GIVEN `docs/runbooks/monorepo-migration.md`
- WHEN an implementer reads the header
- THEN it states `status: historical, migration complete`
- AND the body contains no imperative active source-repo migration steps

### Requirement: REQ-RR-3 — Trim supabase-migrations runbook stale sections

`docs/runbooks/supabase-migrations.md` MUST NOT contain sections about outbox recovery, MP migration, or the old project ref `tzqgwziyiospmvpdgbnt`.

Status: draft

#### Scenario: Stale sections removed

- GIVEN `docs/runbooks/supabase-migrations.md`
- WHEN an implementer runs `rg -i "outbox|Mercado\s?Pago|tzqgwziyiospmvpdgbnt" docs/runbooks/supabase-migrations.md`
- THEN the command returns 0 hits

### Requirement: REQ-RR-4 — Delete trial-user-activation-reminder runbook

File `docs/runbooks/trial-user-activation-reminder.md` MUST NOT exist after this change applies (DELETE per Decision 5).

Status: draft

#### Scenario: File removed

- GIVEN `docs/runbooks/trial-user-activation-reminder.md`
- WHEN an implementer runs `ls docs/runbooks/trial-user-activation-reminder.md`
- THEN the command returns "No such file"
