# openspec-stale-changes-archive Specification

## Purpose

Implements WU4: archive the four stale pre-release-2.0 OpenSpec change folders per the `archive/2026-08-12-<name>/` convention (precedent commit `d554317`), with `archive-report.md` in each and surviving REQs promoted to `openspec/specs/`.

## Requirements

### Requirement: REQ-OSA-1 — Archive release-1-0-1

`openspec/changes/release-1-0-1/` MUST be moved to `openspec/changes/archive/2026-08-12-release-1-0-1/` with an `archive-report.md` citing commit `d554317` as the precedent.

Status: draft

#### Scenario: Folder archived with report

- GIVEN `openspec/changes/release-1-0-1/`
- WHEN an implementer runs `ls openspec/changes/archive/2026-08-12-release-1-0-1/`
- THEN the folder exists with its files and an `archive-report.md`
- AND `openspec/changes/release-1-0-1/` no longer exists

### Requirement: REQ-OSA-2 — Archive release-1-0-2-cleanup

`openspec/changes/release-1-0-2-cleanup/` MUST be moved to `openspec/changes/archive/2026-08-12-release-1-0-2-cleanup/` with an `archive-report.md`.

Status: draft

#### Scenario: Folder archived with report

- GIVEN `openspec/changes/release-1-0-2-cleanup/`
- WHEN an implementer runs `ls openspec/changes/archive/2026-08-12-release-1-0-2-cleanup/`
- THEN the folder exists with its files and an `archive-report.md`
- AND `openspec/changes/release-1-0-2-cleanup/` no longer exists

### Requirement: REQ-OSA-3 — Partially archive release-1-0-3-pwa

`openspec/changes/release-1-0-3-pwa/` MUST be partially archived: Fase 1+2 (already shipped, PR #180) goes to `openspec/changes/archive/2026-08-12-release-1-0-3-pwa/`; Fase 3 (offline walk-in queue) and Fase 4 (mobile verification) remain open and MUST stay under `openspec/changes/release-1-0-3-pwa/` until they ship. The archive folder MUST contain an `archive-report.md` explaining the split.

Status: draft

#### Scenario: Live phases stay, shipped phases archived

- GIVEN `openspec/changes/release-1-0-3-pwa/` containing Fase 1–4
- WHEN an implementer applies the partial archive
- THEN `openspec/changes/archive/2026-08-12-release-1-0-3-pwa/` holds Fase 1+2 and an `archive-report.md` explaining the split
- AND `openspec/changes/release-1-0-3-pwa/` still holds Fase 3 and Fase 4 as open work

### Requirement: REQ-OSA-4 — Archive chore-repo-public-ready with promotion

`openspec/changes/chore-repo-public-ready/` MUST be moved to `openspec/changes/archive/2026-08-12-chore-repo-public-ready/` with an `archive-report.md`. Any REQs that remain valid MUST be promoted to `openspec/specs/<capability>/spec.md`.

Status: draft

#### Scenario: Archived, survivors promoted

- GIVEN `openspec/changes/chore-repo-public-ready/`
- WHEN an implementer archives the folder
- THEN `openspec/changes/archive/2026-08-12-chore-repo-public-ready/` exists with an `archive-report.md`
- AND each surviving REQ is written into `openspec/specs/<capability>/spec.md`
- AND `openspec/changes/chore-repo-public-ready/` no longer exists

### Requirement: REQ-OSA-5 — Every archive-report cites precedent commit

Every `archive-report.md` produced by WU4 MUST cite commit `d554317` (`release-2-0-cleanup-pr-2-email-outbox` → `email-outbox-cleanup`) as the precedent for the archive convention.

Status: draft

#### Scenario: Precedent cited in all four reports

- GIVEN the four archive folders from REQ-OSA-1 through REQ-OSA-4
- WHEN an implementer runs `rg "d554317" openspec/changes/archive/2026-08-12-*/archive-report.md`
- THEN the command returns a hit in all four `archive-report.md` files

### Requirement: REQ-OSA-6 — Final change-folder layout

After WU4 applies, `openspec/changes/` MUST have exactly one active pre-existing change (the partially-archived `release-1-0-3-pwa/`), four archived folders under `openspec/changes/archive/2026-08-12-*/`, plus the new `chore-docs-and-context-align-release-2-0/` itself.

Status: draft

#### Scenario: One active change, four archived

- GIVEN `openspec/changes/` after WU4 applies
- WHEN an implementer runs `ls openspec/changes/`
- THEN the listing shows `archive/`, `release-1-0-3-pwa/`, and `chore-docs-and-context-align-release-2-0/` only
- AND `ls openspec/changes/archive/` shows exactly four `2026-08-12-*` folders
