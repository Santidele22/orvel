# Schema Compliance Lint: `forbidden-columns.sh`

This lint enforces the forbidden-columns contract from ADR 0001 (Schema Principles)
and the locked design decisions from ADR 0002.

## How to invoke

```bash
bash supabase/migrations/lint/forbidden-columns.sh
```

Exit code 0 = PASS (no violations). Exit code 1 = FAIL (violations detected).

## What it checks

| Pattern | Scope | Reference |
|---------|-------|-----------|
| `color_hex` | Absolute ban | R2 — no per-row color tokens on professionals |
| `slot_interval_minutes` | Absolute ban | Legacy column, not in 2.0 |
| `min_notice_minutes` | Absolute ban | Legacy business_settings knob |
| `selected_business_types` | Absolute ban | Legacy per-rubric variant |
| `allow_client_professional_selection` | Absolute ban | Legacy per-rubric variant |
| `tenant_id` | Absolute ban | P1 — single-tenant MVP |
| `auto_assign_professional` without `DEFAULT false` | business_settings only | R7 — must default false |
| `slot_duration_minutes` / `buffer_minutes` on business_settings | Context check | R6 — per-service timing lives on services |

## CI integration

This script should run as a required check for any PR that touches `supabase/migrations/`.
In `.github/workflows/` pipelines:

```yaml
- name: Schema lint
  run: bash supabase/migrations/lint/forbidden-columns.sh
```

The script is intentionally standalone (bash + grep + find) — no runtime dependencies.

## Legacy exclusion

Legacy migration files archived in `supabase/migrations/_legacy/` are excluded from
linting via a `-path "*/_legacy/*" -prune` filter. Only migrations outside `_legacy/`
are subject to the 2.0 rules.
