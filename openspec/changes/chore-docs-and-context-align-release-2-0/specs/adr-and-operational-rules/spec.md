# adr-and-operational-rules Specification

## Purpose

Implements WU2: resolve the ADR `0001-*.md` filename collision (Decision 1) and extend `infra/context/operational-rules.md` with the full `feature → dev → qa → main` promotion pipeline (currently only in root `AGENTS.md`).

## Requirements

### Requirement: REQ-AOR-1 — Rename dev ADR 0001 to -dev.md

File `docs/adr/0001-orvel-monorepo-architecture.md` MUST be renamed to `docs/adr/0001-orvel-monorepo-architecture-dev.md`; the file's `## Status` block MUST note "renamed for release-2.0 collision; slot reserved for `0001-schema-principles.md`".

Status: draft

#### Scenario: Renamed file with collision note

- GIVEN `docs/adr/0001-orvel-monorepo-architecture.md`
- WHEN an implementer runs `ls docs/adr/0001-*.md`
- THEN `0001-orvel-monorepo-architecture-dev.md` exists
- AND `0001-orvel-monorepo-architecture.md` no longer exists
- AND the file's `## Status` block contains a note reserving the `0001` slot for `0001-schema-principles.md`

### Requirement: REQ-AOR-2 — Operational-rules doc documents promotion + CI gate

`infra/context/operational-rules.md` MUST contain the `feature → dev → qa → main` promotion sequence and MUST reference the `dashboard-booking-regressions` required CI check, mirroring root `AGENTS.md` §3-environment promotion flow.

Status: draft

#### Scenario: Pipeline and CI check documented

- GIVEN `infra/context/operational-rules.md`
- WHEN an implementer runs `rg "dev.*qa.*main|dashboard-booking-regressions" infra/context/operational-rules.md`
- THEN the `feature → dev → qa → main` sequence is present (or its ASCII equivalent)
- AND `dashboard-booking-regressions` is referenced as the required CI check
