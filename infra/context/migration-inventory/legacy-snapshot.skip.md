# Legacy Snapshot — SKIPPED

## skip_reason: `legacy_unreachable`

## Details

- **Legacy project ref**: `tzqgwziyiospmvpdgbnt`
- **Attempted method**: `pg_dump --schema-only --no-owner --no-privileges` against `tzqgwziyiospmvpdgbnt.supabase.co:5432`
- **Timestamp**: 2026-07-30

## Connection error (verbatim)

```
pg_dump: connection to database "postgres" on host "tzqgwziyiospmvpdgbnt.supabase.co" failed
——- timed out after 15 seconds with no response
```

DNS resolves (host has addresses 172.64.149.246, 104.18.38.210) but the PostgreSQL port (5432) does not respond — the connection times out. No credentials are available for this project, and the project is **operationally abandoned** per design.md.

## Impact

This skip does NOT block Phase 0 or any subsequent phase. The legacy project is abandoned — no ETL, no parallel cutover, no cleanup window. The snapshot was optional and its absence has zero effect on the migration plan.
