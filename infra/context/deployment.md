# Deployment Context

## Branch Promotion (2-env)

- Sequence: `feature → dev → main`. Skip no step.
- **`main` is the only deployed environment** ([#1133](https://github.com/Santidele22/orvel/issues/1133)). `dev` integrates and runs the gates but is never deployed, and that is deliberate: the pre-merge smoke is the Vercel preview of the pull request.
- Merge method by destination: **squash into `dev`** (one commit per PR), **merge commit into `main`** (a promotion). A squashed promotion lands on `main` as a commit unrelated to `dev`'s history, so the next promotion has a stale merge base and reports `CONFLICTING` even when the content delta is a handful of files; that is how `dev`/`main` drifted from 2026-07-27 until #1138/#1139 restored the ancestry. With merge-commit promotions `dev` stays an ancestor of `main`, so a `dev ← main` back-sync is the exception (a `main`-only commit), not a routine step.
- Per-branch rules live in repository rulesets: `pr-reviews` on `dev`/`main` (1 approving review, `squash` and `merge` commits, no deletions, no force pushes), `ci-gate` on `dev`/`main` (required checks `Dashboard booking regressions` and `Full repo checks`, branch must be up to date) and `promotion-drift-guard` on `main` (required check `Migration drift guard`).
- Required CI gate: check `Dashboard booking regressions` (job `dashboard-booking-regressions` in `.github/workflows/booking-regression.yml`).
- Merging to a protected branch requires explicit Santi approval per PR. Required checks are never bypassed: `gh pr merge <n> --squash --admin` into `dev` and `gh pr merge <n> --merge --admin` into `main` use the owner's per-PR bypass on `pr-reviews`, while `ci-gate` and `promotion-drift-guard` still block until CI runs. Never direct-push to `main`, never `--force`, never bypass a required check.

## Migration Drift Guard

- `Migration drift guard` (`.github/workflows/promotion-drift-guard.yml`) runs on pull requests to `main` and fails when the promotion's merge result would leave two active migrations with the same description (the same migration under an old and a new timestamp, incident #943/#945/#1030) or an active migration the promotion branch does not carry.
- It runs only when the promotion branch carries both the workflow and `scripts/check-migration-drift.mjs`, which a promotion that copies the full file delta does.
- Enforcement lives in the `promotion-drift-guard` ruleset, which requires the check on `main` only. Never add `Migration drift guard` to `ci-gate`: `ci-gate` also covers `dev`, where the workflow never runs, and a required check that never runs blocks every promotion.
- Recovery if the check itself misbehaves: disable or delete the `promotion-drift-guard` ruleset in repository settings, fix, and re-enable.
- Local equivalent: `pnpm run test:promotion-drift`, and `node scripts/check-migration-drift.mjs --base origin/main --head <branch>`.

## Environments

- `dev` — integration. Receives feature PRs. Not deployed.
- `main` — production. Receives `dev → main` PRs only. The only deployed environment.

## Deployed artifacts

`deploy-promotion.yml` runs on pushes to `main` only, and lets Vercel run each build (`vercel deploy` without `--prebuilt`), so a project's build command lives in its Vercel settings, not in the workflow.

| Artifact | Vercel project id | Build command (in the project's settings) | Hostnames (ADR 0012) |
|---|---|---|---|
| Combined: landing + `/dashboard/*` (pwa) + `/booking/*` | `VERCEL_PROJECT_ID` | `pnpm run build:vercel` | `orvel.pro` |
| Console (`apps/dashboard-web`), standalone SPA | `VERCEL_PROJECT_ID_WEB` | `pnpm run build:vercel:web` | `dashboard.orvel.pro` |

The console step skips with a log line while `VERCEL_PROJECT_ID_WEB` does not exist, so a promotion is never blocked by infrastructure that has not been created yet.

**Every project owns its build command, and the shared `vercel.json` must not pin one.** Every project deploys the same repository root, and a `buildCommand` in that file **wins over the project setting**: while it pinned `pnpm run build:vercel`, the console project silently built and shipped the combined site. The file keeps only the genuinely shared fields (`installCommand`, `framework`, the git-deploy switches). `scripts/vercel-output-config.test.mjs` fails if the field comes back.

## Verifying a Promotion

A green PR proves the merge; it never proves the deploy. Check both separately.

1. **The promotion is clean.** `git diff --stat origin/main..origin/dev` is the real delta. `git log origin/main..origin/dev` counts every commit `dev` ever squashed into `main` — 354 commits against a 23-file diff at the time of #1138 — so it overstates a promotion by an order of magnitude. Confirm `main` carries nothing `dev` lacks with `git log origin/dev..origin/main`: it must list only promotion commits.
2. **The deploy ran.** `.github/workflows/deploy-promotion.yml` triggers on the push to `main`, not on the merge itself. `gh run list --workflow=deploy-promotion.yml --limit 1` must end `success`. It links Supabase, sets `ENVIRONMENT=production`, pushes migrations, deploys the four edge functions and both Vercel projects (the console step skips with a log line while `VERCEL_PROJECT_ID_WEB` is unset).
3. **The origins answer.** `https://orvel.pro/` and `https://dashboard.orvel.pro/` return `200`.
4. **The change is actually served.** The HTML lists only eager assets, so feature code ships inside a lazy chunk. Take the entry bundle from the served HTML, list its dynamic imports, and grep those chunks for a distinctive string from the change:

```bash
curl -s https://dashboard.orvel.pro/ | grep -oE 'main-[A-Z0-9]+\.js'                      # entry bundle
curl -s https://dashboard.orvel.pro/main-XXXX.js | grep -oE 'import\("\./chunk-[A-Z0-9]+\.js"\)'  # lazy chunks
curl -s https://dashboard.orvel.pro/chunk-YYYY.js | grep -c '<distinctive string>'          # who carries it
```

Chunk hashes rotate on every build: they are evidence for one deploy, never a stable reference. An installed PWA can keep serving the previous shell until the update banner is accepted or the cache is refreshed, so a missing string on one client is not by itself a failed deploy.

## Deployment Boundaries

- Do not deploy dashboard, landing, functions, or database changes unless Santi explicitly asks.
- Do not assume hosting providers or deployment workflows from folder names alone.
- Do not include secrets or environment-specific credentials in documentation.

## Source-of-truth

- Promotion flow + admin-workaround policy: root `AGENTS.md`, section *Git Workflow*.
- Operational rules: `infra/context/operational-rules.md`.
