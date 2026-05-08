## NG8113 Targeted QA Checklist (Hardening Slice)

Scope intentionally limited to previously reported warnings in:

- `src/app/pages/dashboard/turnos/turnos-list.page.ts`
- `src/app/shared/dashboard-topbar/dashboard-topbar.component.ts`

### Checks

- [ ] `TurnosListPage` standalone `imports` array no longer includes `RouterLink`
- [ ] `TurnosListPage` standalone `imports` array no longer includes `StatusBadgeComponent`
- [ ] `DashboardTopbarComponent` standalone `imports` array no longer includes `RouterLink`
- [ ] Existing bootstrap contracts still pass (`supabase-runtime-bootstrap.contract.spec.ts`)
- [ ] New official Supabase client-path contract passes (`supabase-runtime-official-client-path.red.contract.spec.ts`)

### Notes for GREEN

- Do not add features in this slice.
- Keep runtime bootstrap behavior unchanged while switching client path compatibility to `@supabase/supabase-js`.
