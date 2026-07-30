# Phase 0 — Inventory & Remote Baseline

## Summary

`orvel-qa-dev` (rloovjtdaqvcgzlbppfr) is **reachable** but **NOT empty** as previously assumed in design.md. It contains a full Orvel schema deployed via 6 remote-only migrations (20260729*). The legacy project `tzqgwziyiospmvpdgbnt` is unreachable and operationally abandoned.

### State of orvel-qa-dev

| Dimension | Count | Status |
|-----------|-------|--------|
| Public tables | 12 | ⚠️ Has legacy schema (`business_id` pattern) |
| Edge Functions | 0 | ✓ |
| Secrets | 0 | ✓ |
| Storage buckets | 0 | ✓ |
| Applied migrations | 6 | ⚠️ Remote-only, not in local repo |

### Legacy status

The legacy project `tzqgwziyiospmvpdgbnt` is **operationally abandoned** and unreachable (pg_dump connection times out). No snapshot was captured. This has zero impact on the migration — no ETL, no parallel cutover, no cleanup window.

## Artifacts

### Remote baseline
- **Script**: `path: remote-baseline.sh`
- **Output**: `path: remote-baseline.txt`
- Probes 4 dimensions: tables, functions, secrets, buckets

### Schema
- **DDL reconstruction**: `path: schema.sql`
- Captures all 12 public tables, indexes, constraints as of 2026-07-30

### Row counts
- **File**: `path: row-counts.txt`
- Per-table live row counts and sizes
- 8 of 12 tables contain test/seed data

### Edge Functions
- **File**: `path: functions.md`
- Count: 0 deployed (local repo has 12 for Phase 2)

### Secrets
- **File**: `path: secrets.md`
- Count: 0 in vault.secrets

### Storage
- **File**: `path: storage.md`
- Count: 0 buckets

### Legacy snapshot
- **Skip note**: `path: legacy-snapshot.skip.md`
- Reason: `legacy_unreachable` (connection timeout)
- Not a blocker: the legacy project is **operationally abandoned**

## Totals

| Metric | Value |
|--------|-------|
| Public tables | 12 |
| Edge Functions | 0 |
| Secrets | 0 |
| Storage buckets | 0 |
| Legacy snapshot | SKIPPED (unreachable) |

## Critical Finding

The `orvel-qa-dev` project is NOT the empty target described in the design document. It has a full legacy-like schema deployed via 6 migrations from 2026-07-29 that do not exist in the local repository. The schema uses `business_id` FK pattern (not the redesigned `business_type_id` pattern from the 2.0 plan). **This must be resolved before Phase 2 migrations are applied** — either:

1. **Rebuild from scratch**: Drop all public schema objects in `orvel-qa-dev` and start fresh per the Option C plan.
2. **Adopt as base**: Treat the existing schema as the starting point and evolve it with new migrations.

This is a decision for Santi and the Phase 1 ADR process.

## Validation Status (vs tasks.md)

| Task | Validation | Status |
|------|-----------|--------|
| 0.1 | Script authored with exit codes documented | ✅ `remote-baseline.sh` exists with documented exit codes |
| 0.2 | `remote-baseline.txt` exists, counts documented | ⚠️ File exists but project NOT empty (12 tables) — mismatch with design assumption |
| 0.3 | Legacy snapshot skip documented | ✅ `legacy-snapshot.skip.md` with exact error + timestamp |
| 0.4 | README links all artifacts, mentions "operationally abandoned" | ✅ This file |

## Next Phase

**Phase 1 (ADRs)** is ready to begin. The key input from Phase 0 to Phase 1 is:

- The existing remote schema is the legacy `business_id` pattern — the new ADRs must define the target schema.
- Santi must decide whether to reset `orvel-qa-dev` to empty or treat it as a base.
- The 0 functions / 0 secrets / 0 buckets finding confirms those dimensions are safe to fill from scratch.
