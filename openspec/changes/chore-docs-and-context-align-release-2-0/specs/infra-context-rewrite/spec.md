# infra-context-rewrite Specification

## Purpose

Implements WU1: rewrite `infra/context/product.md`, `supabase.md`, `deployment.md`, and `environments.md` so source-of-truth docs describe the post-release-2.0 target instead of pre-release-2.0 state (MP billing, MVP date, dead branch, no CI gate).

## Requirements

### Requirement: REQ-ICR-1 — Product doc must not reference MercadoPago

`infra/context/product.md` MUST NOT mention `MercadoPago`, `Mercado Pago`, or `MP preapproval` as the billing source-of-truth (release-2.0 purged MP).

Status: draft

#### Scenario: No MP billing references remain

- GIVEN `infra/context/product.md`
- WHEN an implementer runs `rg -i "Mercado\s?Pago|MP preapproval" infra/context/product.md`
- THEN the command returns 0 hits

### Requirement: REQ-ICR-2 — Product doc describes mobile-first PWA

`infra/context/product.md` MUST describe Orvel as a mobile-first PWA, with desktop-only scope explicitly carved out.

Status: draft

#### Scenario: Mobile-first positioning present

- GIVEN `infra/context/product.md`
- WHEN an implementer reads the product description
- THEN it states Orvel is a mobile-first PWA
- AND it explicitly names desktop-only scope as out of the mobile surface

### Requirement: REQ-ICR-3 — Product doc drops MVP date and M1–M8 roadmap

`infra/context/product.md` MUST NOT contain `MVP`, `June`, and `2026` together; MUST NOT list the M1–M8 must-haves section; and MUST NOT list "Mobile app" as a non-goal.

Status: draft

#### Scenario: MVP date and M1–M8 roadmap removed

- GIVEN `infra/context/product.md`
- WHEN an implementer runs `rg "MVP.*June|M1|M2|M3|M4|M5|M6|M7|M8" infra/context/product.md`
- THEN the command returns 0 hits
- AND no "Mobile app" non-goal line remains (desktop-only scope is stated instead)

### Requirement: REQ-ICR-4 — Supabase doc points at active project ref

`infra/context/supabase.md` MUST reference `orvel-qa-dev` as the active project ref; MUST NOT reference the dead branch `feat/import-orvel-repos`, the 2026-07-12 incident block, or `20260508000000_mp_preapproval_plan_sprint1.sql` (archived to `_legacy/`).

Status: draft

#### Scenario: Active ref present, stale refs absent

- GIVEN `infra/context/supabase.md`
- WHEN an implementer runs `rg "orvel-qa-dev" infra/context/supabase.md`
- THEN `orvel-qa-dev` appears as the active project ref
- AND `rg "feat/import-orvel-repos|2026-07-12|20260508000000_mp_preapproval_plan_sprint1" infra/context/supabase.md` returns 0 hits

### Requirement: REQ-ICR-5 — Deployment doc documents 3-env promotion and CI gate

`infra/context/deployment.md` MUST describe the `feature → dev → qa → main` promotion and MUST reference the `dashboard-booking-regressions` CI gate.

Status: draft

#### Scenario: Promotion and CI gate documented

- GIVEN `infra/context/deployment.md`
- WHEN an implementer runs `rg "dev.*qa.*main|dashboard-booking-regressions" infra/context/deployment.md`
- THEN the 3-env promotion sequence is present (or its ASCII equivalent `feature → dev → qa → main`)
- AND `dashboard-booking-regressions` is referenced as the required CI check

### Requirement: REQ-ICR-6 — Environments doc has distinct per-env sections

`infra/context/environments.md` MUST have distinct sections for local development, dev, qa, and main; once REQ-ICR-5 ships it MUST NOT claim "no environment names verified".

Status: draft

#### Scenario: Four distinct environment sections

- GIVEN `infra/context/environments.md`
- WHEN an implementer reads the headings
- THEN distinct sections exist for local development, dev, qa, and main
- AND `rg "no environment names verified" infra/context/environments.md` returns 0 hits
