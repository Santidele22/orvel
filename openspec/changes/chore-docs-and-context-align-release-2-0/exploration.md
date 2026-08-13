## Exploration: chore-docs-and-context-align-release-2-0

### Current State
Root docs describe pre-release-2.0 state. release-2.0 work exists ONLY on feature branches (`origin/feature/release-2-0-*`), NOT merged to dev (dev HEAD 6e604ce). dev still has 14 Edge Functions incl MP + outbox. New ADRs 0001-0004 (collide w/ dev 0001), migration-inventory/, _legacy/ archive all live only on release branches.

### Affected Areas
- `infra/context/product.md` — MP source-of-truth L58-64, Mobile app non-goal L52, MVP June-25 L17, M1-M8 L35-42. STALE.
- `infra/context/architecture.md` — already partially rewritten in working tree (git M, uncommitted). IN PROGRESS.
- `infra/context/supabase.md` — dead branch feat/import-orvel-repos L12, incident L14, MP preapproval migration L29. STALE.
- `infra/context/operational-rules.md` — auto-push documented L7-8 (finding #4 wrong on dead branch L12). Missing 3-branch promotion.
- `infra/context/deployment.md`, `environments.md` — generic, no CI/3-env. STALE.
- `docs/adr/0001-orvel-monorepo-architecture.md` — "pending implementation verification" L5, "separate repos not clean". STALE + numbering collision with release 0001-schema-principles.
- `docs/runbooks/*` — account-closure STALE (target=501 stub); monorepo-migration STALE; supabase-migrations partial stale; trial-reminder conflicts dev vs target.
- `openspec/changes/*` — release-1-0-1 outbox + release-1-0-2 email-templates invalidated by target. release-1-0-1 NOT archived.
- `docs/diagrams/` — untracked; 01 complete, 04 has mmd only (no glosa/excalidraw), README lists 04 as pending.

### Approaches
1. **Docs-only refresh to target state** (WU1+WU2+WU3) — rewrite infra/context, resolve ADR collision, refresh runbooks. Pros: small, no runtime dependency. Cons: claims target state not on dev; ADR import risk. Effort: Medium.
2. **Two-phase** — Phase A docs (infra/adr/runbooks), Phase B openspec+diagrams consistency. Pros: clean PR slices under 800 lines. Cons: none significant. Effort: Medium.
3. **Defer ADR import until release-2.0 merges to dev** — only refresh infra/context + runbooks now, mark ADRs as pending merge. Pros: no duplication risk. Cons: docs stay partially inconsistent until merge. Effort: Low.

### Recommendation
Two-phase approach (option 2). Phase A: infra/context + ADR collision resolution + runbook refresh. Phase B: openspec archive/supersede decisions + diagrams glosa/README consistency. Ask-on-risk on ADR import timing and openspec archive policy.

### Risks
- ADR 0001 filename collision (two different ADRs named 0001).
- Importing ADRs 0002-0004 from unmerged branch risks duplication.
- Docs claiming target state not on dev — must label TARGET explicitly.
- Untracked docs/diagrams could be committed in the wrong change.

### Ready for Proposal
Yes — pending Santi's answers to the 5 scope questions (ADR import timing/collision, openspec archive policy, diagrams commit, trial-reminder runbook direction).
