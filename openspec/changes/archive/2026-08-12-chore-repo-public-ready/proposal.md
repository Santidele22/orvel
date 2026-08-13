# Change: chore-repo-public-ready

## Why

The repo became public (2026-07-28) after being private for the first year. Before being public we relied on the repo being private + client-side trust to handle the brand strategy and personal infrastructure references. Now that anyone can see the code, we need a one-time cleanup to make the repo look professional and remove accidental leaks.

This change is a checklist of small follow-ups. None are blocking for the main 3-env work (release-2-0-supabase-migration), but they make the public repo presentable for newcomers, contributors, and recruiters.

## What Changes

- Removes references to the old personal Supabase project (`tzqgwziyiospmvpdgbnt`) which was never meant to be public.
- Adds the standard open-source boilerplate (LICENSE, CONTRIBUTING.md, SECURITY.md).
- Updates documentation that referenced the old deployment pipeline.
- Aligns `.gitignore` with the public-repo reality.

## Impact

- **Repo presentation**: Anyone landing on the GitHub repo sees a clean README + LICENSE + contributing guide.
- **History**: Old project ref stays in git history but is removed from current code/docs (full rewrite of `infra/context/supabase.md`).
- **Brand strategy docs**: Already moved to `to-company-os-export/orvel/` (out of orvel).
- **CI/CD**: Unaffected. Workflows already running.

## Phases

This is a one-shot chore. No phases, no migration window. Just file edits + 1 PR.

## Risks

- **Low risk**: All changes are documentation, configuration, and metadata. No runtime behavior changes.
- **History leak**: The old project ref `tzqgwziyiospmvpdgbnt` is still visible in git history (any commit before this cleanup). For a public repo, full history rewrite is invasive (requires force-push + coordination). Accepted risk — that ref is already documented in many places.

## Success Criteria

- [ ] README looks like a real OSS project on first view
- [ ] LICENSE file present (MIT or Apache 2.0 — Santi decides)
- [ ] CONTRIBUTING.md with local dev + testing + PR conventions
- [ ] SECURITY.md with vulnerability reporting path
- [ ] Zero references to `tzqgwziyiospmvpdgbnt` in current code/docs
- [ ] `.gitignore` covers all known sensitive patterns
- [ ] `infra/context/environments.md` reflects the new 2-Supabase architecture
- [ ] `infra/context/deployment.md` reflects the new Vercel + GitHub Actions pipeline

## Tasks

- [ ] **1. Add `LICENSE` file** — MIT (recommended for permissive OSS). Verify no existing license file.
- [ ] **2. Add `CONTRIBUTING.md`** — local dev setup, testing approach (Strict TDD per ADR-015), PR conventions, commit message format.
- [ ] **3. Add `SECURITY.md`** — vulnerability reporting path (e.g., GitHub Security Advisories), supported versions, response time.
- [ ] **4. Remove `tzqgwziyiospmvpdgbnt` from current code**:
  - [ ] `infra/context/supabase.md` — rewrite without the personal project ref.
  - [ ] Any `.ts/.sql/.json` files referencing the old ref (search via `rg tzqgwziyiospmvpdgbnt`).
  - [ ] Any test files that hardcode that ref.
- [ ] **5. Update `infra/context/environments.md`** to reflect the 2-Supabase architecture (`orvel-qa-dev` + `orvel-prod`).
- [ ] **6. Update `infra/context/deployment.md`** to reflect the new Vercel + GitHub Actions pipeline (deploy-promotion workflow).
- [ ] **7. Verify `.gitignore` completeness**:
  - [ ] `.env*` (already covered)
  - [ ] `.env.example` exception (already covered)
  - [ ] `node_modules/` (already covered)
  - [ ] `dist/`, `build/`, `.angular/`, `.astro/` (already covered)
  - [ ] `marketing/` (newly added)
  - [ ] `screenshots/` (newly added)
  - [ ] `skills-lock.json` (newly added)
  - [ ] `to-company-os-export/` (newly added)
  - [ ] `.funemon/` (already covered)
- [ ] **8. Add `CODEOWNERS`** (`.github/CODEOWNERS`) with Santi as owner of `.github/workflows/`, `openspec/`, and `supabase/migrations/`. Ensures only Santi approves sensitive changes.
- [ ] **9. Add badges to README** — replace placeholder badges with real ones (CI status, license).
- [ ] **10. Verify no secrets in git history** — `git log -p | grep -E "(API_KEY|SECRET|PASSWORD)"` to confirm no accidental leaks.

## Validation

- [ ] GitHub repo page renders README + LICENSE + CONTRIBUTING.md + SECURITY.md
- [ ] `rg tzqgwziyiospmvpdgbnt .` returns zero matches
- [ ] All new files committed in a single PR `chore: make repo public-ready`
- [ ] No CI changes required (no workflow file modifications)

## Out of Scope

- Full git history rewrite (force-push to erase old ref). Accepted risk.
- Replacing placeholder badge URLs with real ones (Santi needs to provide working URLs).
- Migrating brand files to company-os repo (Santi does manually via copy).
- Removing all `orvel-*` references from test files (those are intentional, not leaks).