# Repo Public Readiness Specification

## Purpose

The Orvel monorepo went public on 2026-07-28 after a year as a private repository. This spec codifies the standing repo-readiness contract that the repo MUST keep satisfying: OSS boilerplate present (LICENSE, CONTRIBUTING.md, SECURITY.md, CODEOWNERS), `.gitignore` covering all known sensitive patterns, and zero references to the legacy personal Supabase project ref `tzqgwziyiospmvpdgbnt` in current code/docs. Promoted from the archived change `chore-repo-public-ready` (see `openspec/changes/archive/2026-08-12-chore-repo-public-ready/archive-report.md`).

## Requirements

### Requirement: LICENSE File Present

The repository root MUST contain a `LICENSE` file with an OSI-approved license (MIT or Apache 2.0 per the archived change's decision).

#### Scenario: License Exists At Repository Root

- GIVEN the repository root
- WHEN an implementer runs `Test-Path LICENSE`
- THEN a `LICENSE` file MUST exist at the root
- AND it MUST name an OSI-approved license

### Requirement: CONTRIBUTING Guide Present

The repository root MUST contain a `CONTRIBUTING.md` documenting local dev setup, the testing approach (Strict TDD per ADR-015), PR conventions, and commit message format.

#### Scenario: Contributing Guide Exists At Repository Root

- GIVEN the repository root
- WHEN an implementer runs `Test-Path CONTRIBUTING.md`
- THEN a `CONTRIBUTING.md` MUST exist
- AND it MUST document local dev setup and PR/commit conventions

### Requirement: SECURITY Policy Present

The repository root MUST contain a `SECURITY.md` with a vulnerability reporting path (e.g., GitHub Security Advisories), supported versions, and response time.

#### Scenario: Security Policy Exists At Repository Root

- GIVEN the repository root
- WHEN an implementer runs `Test-Path SECURITY.md`
- THEN a `SECURITY.md` MUST exist
- AND it MUST provide a vulnerability reporting path

### Requirement: CODEOWNERS Restricts Sensitive Paths

The repository MUST contain `.github/CODEOWNERS` assigning Santi as owner of `.github/workflows/`, `openspec/`, and `supabase/migrations/`, so that only Santi approves sensitive changes.

#### Scenario: CODEOWNERS Exists And Covers Sensitive Paths

- GIVEN the repository root
- WHEN an implementer runs `Test-Path .github/CODEOWNERS`
- THEN the file MUST exist
- AND it MUST assign ownership for `.github/workflows/`, `openspec/`, and `supabase/migrations/`

### Requirement: .gitignore Covers Sensitive Patterns

The root `.gitignore` MUST cover all known sensitive patterns: `.env*`, `node_modules/`, `dist/`, `build/`, `.angular/`, `.astro/`, `marketing/`, `screenshots/`, `skills-lock.json`, `to-company-os-export/`, and `.funemon/`.

#### Scenario: Sensitive Patterns Ignored

- GIVEN the root `.gitignore`
- WHEN an implementer greps it for the known sensitive patterns
- THEN each of `.env*`, `node_modules/`, `dist/`, `build/`, `.angular/`, `.astro/`, `marketing/`, `screenshots/`, `skills-lock.json`, `to-company-os-export/`, `.funemon/` MUST be present

### Requirement: Legacy Supabase Ref Purged From Current Code And Docs

Current code and docs MUST NOT reference the legacy personal Supabase project ref `tzqgwziyiospmvpdgbnt`. The ref may remain in git history (full history rewrite is out of scope and requires force-push), but no current tracked file SHALL contain it.

#### Scenario: Zero Refs In Current Code And Docs

- GIVEN the repository tree
- WHEN an implementer runs a repository-wide search for `tzqgwziyiospmvpdgbnt`
- THEN the search MUST return zero matches in current tracked code and docs
- AND the ref MAY appear only in git history, never in the working tree
