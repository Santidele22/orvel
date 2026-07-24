# Tasks — Release 1.0.2 — Limpieza de deuda arquitectónica

> **Specs**: `openspec/changes/release-1-0-2-cleanup/specs/*/spec.md`
> **Design**: `openspec/changes/release-1-0-2-cleanup/design.md`
> **Propuesta**: `openspec/changes/release-1-0-2-cleanup/proposal.md`
> **Criterio**: force-chained, ≤400 líneas/PR. Cada fase es un commit atómico y revisable. TDD estricto.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1310 total (5 PRs) |
| 400-line budget risk | Medium (mitigado con force-chained) |
| Chained PRs recommended | Yes |
| Suggested split | PR #1 → #2 → #3 → #4 → #5 |
| Delivery strategy | force-chained |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Migración `is_promoted` + landing/signup dinámicos | PR #1 | `node --test supabase/checks/20260724010000_add_is_promoted.contract.test.mjs` | `pnpm build` desde `apps/landing/` | Revertir M1; restaurar filter hardcodeado |
| 2 | Preflight + drop `theme_key` + dashboard simplificado | PR #2 | `node --test supabase/checks/20260724011000_drop_theme_key.contract.test.mjs` | `pnpm build` desde `apps/dashboard/` | Revertir M2; restaurar `THEME_BY_BUSINESS_TYPE` |
| 3 | Paquete compartido + migrar imports + eliminar copias | PR #3 | `pnpm test -- apps/shared/email-templates/` | `pnpm build` dashboard + Deno check Edge Function | Revertir imports; restaurar copias locales |
| 4 | Knobs en `business_settings` + RPC + error codes | PR #4 | `node --test supabase/checks/20260724012000_add_booking_knobs.contract.test.mjs` | `pnpm build` dashboard + Deno check | Revertir RPC/helper; dropear columnas nuevas |
| 5 | Crear `roadmap.md` + verificar cross-ref | PR #5 | `ls openspec/changes/release-1-0-1/roadmap.md` | N/A — sin código | `git revert` del commit individual |

---

## PR #1 — business-types-promoted (force-chained)

**Spec**: `specs/business-types-promoted/spec.md`
**Migrations**: `supabase/migrations/20260724010000_add_business_types_is_promoted.sql`
**Files**: migración, `contract test`, `apps/landing/src/lib/business-types.ts` (nuevo), `Features.astro`, `onboarding.astro`, `account.astro`
**Estimated lines**: ~300
**Dependencia**: Ninguna (PR raíz)

### Fase 1.1 — Migración: add is_promoted column + seed 4 promoted (RED → GREEN)

- [x] 1.1.1 Crear contract test `supabase/checks/20260724010000_add_is_promoted.contract.test.mjs`:
       verifica que (a) columna `is_promoted` existe con `BOOLEAN NOT NULL DEFAULT false`, (b) las 8 filas arrancan con default false, (c) post-UPDATE exactamente 4 filas con `is_promoted = true` (`unas`, `masajes`, `barberia`, `peluqueria`) y 4 con false (`pestanas`, `cejas`, `spa`, `otro`).
       **RED**: ejecutar `node --test supabase/checks/20260724010000_add_is_promoted.contract.test.mjs` → falla (columna no existe).
- [x] 1.1.2 Crear migración `supabase/migrations/20260724010000_add_business_types_is_promoted.sql`:
       ```sql
       BEGIN;
       ALTER TABLE public.business_types ADD COLUMN IF NOT EXISTS is_promoted BOOLEAN NOT NULL DEFAULT false;
       UPDATE public.business_types SET is_promoted = true WHERE code IN ('unas', 'masajes', 'barberia', 'peluqueria');
       -- Redefinir get_dashboard_reference_catalog() para incluir is_promoted en business_types
       CREATE OR REPLACE FUNCTION public.get_dashboard_reference_catalog() …;
       COMMIT;
       ```
       **GREEN**: contract test → 100% pasa.
- [x] 1.1.3 REFACTOR: verificar idempotencia (`IF NOT EXISTS`, `ON CONFLICT`); sin side effects.

**Commit**: `feat(db): add is_promoted column to business_types with 4 promoted seeds`

### Fase 1.2 — Landing: filtrar Features y signup por is_promoted (RED → GREEN)

- [x] 1.2.1 Crear `apps/landing/src/lib/business-types.ts` — función `getPromotedBusinessTypes()` que retorna array de `{code, label}` desde catálogo RPC o fallback estático (4 promovidos). Exporta `getBusinessTypesForSignup()` (4 promovidos + "Otro").
       **RED**: test `apps/landing/src/lib/business-types.test.ts` — verifica 4 promovidos exactos, fallback coincide con seed.
- [x] 1.2.2 `apps/landing/src/components/organisms/Features.astro` — Reemplazar 3 cards hardcodeadas (Barberías, Masajes, Nail Salons) por render dinámico desde `getPromotedBusinessTypes()`. Grid se adapta: `lg:grid-cols-2` para 4 cards. Conservar estructura visual existente (gradient overlay, hover arrow).
       **GREEN**: test pasa; `pnpm build` desde `apps/landing/` sin errores.
- [x] 1.2.3 `apps/landing/src/pages/auth/signup/onboarding.astro` — Selector radio de rubro: renderizar 5 opciones dinámicamente (4 promovidos + "Otro" hardcodeado como opción final). Eliminar lista hardcodeada de radios.
       **GREEN**: verificar 5 radio buttons, atributos `value` y `name` correctos.
- [x] 1.2.4 `apps/landing/src/pages/auth/signup/account.astro` — Selector checkbox de rubro: mismo patrón que onboarding (5 opciones dinámicas). Eliminar lista hardcodeada.
       **GREEN**: verificar 5 checkboxes, atributos correctos.
- [x] 1.2.5 REFACTOR: consolidar lógica de filtro en `business-types.ts`; eliminar listas hardcodeadas de rubros en componentes Astro. Asegurar "Otro" tiene `is_promoted = false` en DB pero aparece en signup.

**Commit**: `refactor(landing): filter Features and signup selectors by is_promoted`

### Fase 1.3 — Verificación final PR #1

- [x] 1.3.1 Contract test `supabase/checks/20260724010000_add_is_promoted.contract.test.mjs` — 100% pasa.
- [x] 1.3.2 Test unitario `apps/landing/src/lib/business-types.test.ts` — 100% pasa.
- [x] 1.3.3 `pnpm build` desde `apps/landing/` — sin errores ni warnings nuevos.
- [x] 1.3.4 E2E visual: Features renderiza 4 cards (Uñas, Masajes, Barbería, Peluquería). Signup (onboarding + account) renderiza 5 opciones: 4 promovidos + "Otro".

### DoD PR #1

- [x] Columna `is_promoted` existe con `BOOLEAN NOT NULL DEFAULT false`
- [x] 4 filas `is_promoted = true`: `unas`, `masajes`, `barberia`, `peluqueria`
- [x] 4 filas `is_promoted = false`: `pestanas`, `cejas`, `spa`, `otro`
- [x] Landing Features renderiza solo 4 cards promovidas
- [x] Signup onboarding + account muestran 5 opciones (4 promovidos + Otro)
- [x] `pnpm build` landing pasa
- [x] Contract test y unit test pasan

### Rollback PR #1

Revertir migración M1: `DROP COLUMN IF EXISTS is_promoted`. Revertir `get_dashboard_reference_catalog()`. Componentes Astro vuelven a filter hardcodeado. `git revert` del commit.

---

## PR #2 — single-theme-cleanup

**Spec**: `specs/single-theme-cleanup/spec.md`
**Migrations**: `supabase/migrations/20260724011000_drop_business_types_theme_key.sql`
**Files**: migración, `contract test`, `dashboard-business-rules.ts`, `dashboard-theme-palettes.tokens.ts`, `theme.tokens.ts`, `reference-catalog.ts`, `dashboard-session-business-types.ts`
**Estimated lines**: ~240
**Dependencia**: PR #1 (M2 viene después de M1; el RPC ya incluye `is_promoted`)

### Fase 2.1 — Preflight: verificar dependencias de theme_key

- [x] 2.1.1 Ejecutar `\d+ public.business_types` contra DB local y documentar toda vista, constraint, o función que referencie `theme_key`.
- [x] 2.1.2 Verificar que `get_dashboard_reference_catalog()` es la única vista/función activa que referencia `theme_key`. Si hay más, listarlas y planificar recreación en M2.
       **Bloqueante**: si existen vistas no documentadas, no avanzar hasta resolver.

**Commit**: `docs(db): preflight theme_key dependencies before drop`

### Fase 2.2 — Migración: drop theme_key column (RED → GREEN)

- [x] 2.2.1 Crear contract test `supabase/checks/20260724011000_drop_theme_key.contract.test.mjs`:
       verifica que (a) columna `theme_key` ya no existe post-migración, (b) las 8 filas conservan sus demás columnas intactas, (c) `get_dashboard_reference_catalog()` funciona y no incluye `theme_key` en el output JSON.
       **RED**: ejecutar → falla (columna aún existe).
- [x] 2.2.2 Crear migración `supabase/migrations/20260724011000_drop_business_types_theme_key.sql`:
       ```sql
       BEGIN;
       -- Redefinir get_dashboard_reference_catalog() sin theme_key en business_types
       CREATE OR REPLACE FUNCTION public.get_dashboard_reference_catalog() …;
       ALTER TABLE public.business_types DROP COLUMN IF EXISTS theme_key;
       COMMIT;
       ```
       **GREEN**: contract test → 100% pasa.
- [x] 2.2.3 REFACTOR: verificar idempotencia (`DROP COLUMN IF EXISTS`).

**Commit**: `refactor(db): drop theme_key column from business_types`

### Fase 2.3 — Dashboard: simplificar resolver de tema (RED → GREEN)

- [x] 2.3.1 Crear/actualizar test unitario `dashboard-business-rules.test.ts`:
       verifica que `resolveDashboardConfig()` siempre retorna tema `'zen'` sin lookup, para cualquier businessType.
       **RED**: test falla (aún existe `THEME_BY_BUSINESS_TYPE`).
- [x] 2.3.2 `apps/dashboard/src/app/core/theming/dashboard-business-rules.ts` — Eliminar `THEME_BY_BUSINESS_TYPE`, simplificar `resolveDashboardConfig()` para retornar `theme: 'zen'` sin map lookup. Remover tipo `BusinessType` si no se usa en otro lado.
       **GREEN**: test unitario pasa.
- [x] 2.3.3 `apps/dashboard/src/app/core/theming/dashboard-session-business-types.ts` — Si consume `BusinessType`, actualizar imports.
- [x] 2.3.4 `apps/dashboard/src/app/core/catalog/reference-catalog.ts` — Si tipa `theme_key`, remover del tipo.
- [x] 2.3.5 REFACTOR: `grep -r "THEME_BY_BUSINESS_TYPE" apps/` → cero resultados.

**Commit**: `refactor(dashboard): simplify theme resolver to always return zen`

### Fase 2.4 — Tokens: conservar solo palette zen

- [x] 2.4.1 `apps/dashboard/src/app/core/theming/dashboard-theme-palettes.tokens.ts` — Eliminar palettes/alias no `zen`. Dejar solo la exportación de `zen`.
- [x] 2.4.2 `apps/dashboard/src/app/core/theming/theme.tokens.ts` — Si exporta `DashboardThemeName` como union type, simplificar a `type DashboardThemeName = 'zen'` o eliminar el tipo si es innecesario.
- [x] 2.4.3 REFACTOR: `grep -r "theme_key" apps/ supabase/functions/` — solo resultados en migraciones históricas o docs, no en código vivo.

**Commit**: `refactor(dashboard): remove themeKey from CatalogBusinessType and fixture data`

### Fase 2.5 — Verificación final PR #2

- [x] 2.5.1 Contract test `supabase/checks/20260724011000_drop_theme_key.contract.test.mjs` — 100% pasa.
- [x] 2.5.2 Test unitario `dashboard-business-rules.test.ts` — 100% pasa.
- [x] 2.5.3 `pnpm build` desde `apps/dashboard/` — sin errores.
- [x] 2.5.4 `grep -r "theme_key" apps/ supabase/functions/` — sin resultados en código vivo.
- [x] 2.5.5 Los 41 contract tests (1.0.1 + PR #1 + PR #2) siguen pasando.

### DoD PR #2

- [x] Columna `theme_key` eliminada de `business_types`
- [x] `get_dashboard_reference_catalog()` no incluye `theme_key`
- [x] `THEME_BY_BUSINESS_TYPE` eliminado de `dashboard-business-rules.ts`
- [x] Resolver de tema hardcodeado a `'zen'`
- [x] Palette `zen` es la única en tokens
- [x] `grep theme_key` en código vivo = cero resultados
- [x] `pnpm build` dashboard pasa
- [x] Contract tests 1.0.1 intactos

### Rollback PR #2

Revertir M2: recrear columna `ALTER TABLE business_types ADD COLUMN theme_key TEXT NOT NULL DEFAULT 'default'`, restaurar valores por `code` (`beauty`/`wellness`/`default`), redefinir RPC. Revertir `dashboard-business-rules.ts` a versión con `THEME_BY_BUSINESS_TYPE`. `git revert` del PR.

---

## PR #3 — email-templates-shared

**Spec**: `specs/email-templates-shared/spec.md`
**Files**: `apps/shared/email-templates/` (nuevo), `pnpm-workspace.yaml`, `apps/dashboard/package.json`, `process-email-outbox/index.ts`, borrar `appointment-email-templates.ts` y `appointment-templates.ts`
**Estimated lines**: ~330 (movimiento detectado como rename)
**Dependencia**: PR #2 (el dashboard ya tiene imports limpios de theme)
**Nota**: `business-templates.ts` NO se elimina — es de otra categoría (signup, welcome, trial). Solo se consolidaron templates de turnos.

### Fase 3.1 — Paquete compartido: source of truth único (RED → GREEN)

- [x] 3.1.1 Crear `apps/shared/email-templates/`:
       `package.json` (`"name": "@orvel/shared"`, export `./email-templates`),
       `index.ts` (barrel exports),
       `appointment-template.types.ts` (tipos compartidos),
       `appointment-templates.ts` (templates canónicos: confirmation, reschedule, cancellation, business_notification, business_cancellation, con todos los renderers de ambas copias existentes).
       **RED**: test `apps/shared/email-templates/appointment-templates.test.ts` — snapshot de HTML de cada template.
- [x] 3.1.2 Registrar en `pnpm-workspace.yaml` (`apps/shared/*`) y `apps/dashboard/package.json` (`"@orvel/shared": "workspace:*"`). Ejecutar `pnpm install`.
       **GREEN**: test de snapshot pasa.
- [x] 3.1.3 REFACTOR: asegurar nombres kebab-case, exports explícitos, sin dependencias Node/Deno específicas (APIs Web solamente).

**Commit**: `feat(shared): create unified email-templates package`

### Fase 3.2 — Migrar imports del dashboard

- [x] 3.2.1 `apps/dashboard/src/app/core/notifications/templates/` — Actualizar imports de `appointment-email-templates.ts` para importar desde `@orvel/shared/email-templates`.
       **GREEN**: `pnpm build` desde `apps/dashboard/` sin errores de resolución.
- [x] 3.2.2 Tests de dashboard que verifican render de emails: actualizados sus imports.
       **GREEN**: `pnpm vitest run` — sin regresiones.

**Commit**: `refactor(dashboard): migrate email template imports to shared package`

### Fase 3.3 — Migrar imports de Edge Functions

- [x] 3.3.1 `supabase/functions/process-email-outbox/index.ts` — Actualizar imports para usar path relativo `../../../apps/shared/email-templates/appointment-templates.ts`.
- [x] 3.3.2 `supabase/functions/_shared/process-email-outbox-helpers.ts` — Actualizar imports.
- [x] 3.3.3 Eliminar handlers `*_business` (líneas 441-444) y catch-all `template_key.endsWith("_business")` (línea 453-456) en `process-email-outbox/index.ts`. Convertir a no-op con comentario.
       **GREEN**: imports actualizados en todos los referenciadores.
- [x] 3.3.4 REFACTOR: `grep -r "endsWith.*_business" supabase/functions/` → cero resultados activos.

**Commit**: `refactor(edge): migrate email template imports to shared package, remove _business routing`

### Fase 3.4 — Eliminar copias locales

- [x] 3.4.1 Eliminar `apps/dashboard/src/app/core/notifications/templates/appointment-email-templates.ts`.
- [x] 3.4.2 Eliminar `supabase/functions/_shared/templates/appointment-templates.ts`.
       `business-templates.ts` se conserva (no es parte de la consolidación de templates de turnos).
- [x] 3.4.3 `pnpm build` dashboard → sin errores de import.

**Commit**: `chore: remove duplicated local email template copies`

### Fase 3.5 — Verificación final PR #3

- [x] 3.5.1 `pnpm test -- apps/shared/email-templates/` — 9/9 tests pasan.
- [x] 3.5.2 `pnpm build` desde `apps/dashboard/` — sin errores.
- [x] 3.5.3 Deno check: imports actualizados en `process-email-outbox/index.ts`, `process-email-outbox-helpers.ts`, y tests Deno `p0-mvp-static-contracts.test.ts`, `signup-email-confirmation-flow.red.contract.test.ts`, `appointment-email-rendering.test.ts`.
- [x] 3.5.4 `grep -r "appointment-email-templates\|appointment-templates" apps/ supabase/functions/` — solo referencias al paquete compartido, no a archivos eliminados.
- [x] 3.5.5 Los 41 contract tests siguen pasando.

### DoD PR #3

- [x] `apps/shared/email-templates/` existe como paquete workspace
- [x] Dashboard importa desde `@orvel/shared/email-templates`
- [x] Edge Functions importan desde path relativo al shared package
- [x] Archivos `appointment-email-templates.ts`, `appointment-templates.ts` eliminados
- [x] Handlers `_business` eliminados/convertidos a no-op en `process-email-outbox`
- [x] HTML producido usa el formato canónico (confirmation sin detail list, consistentemente)
- [x] `pnpm build` dashboard pasa

### Rollback PR #3

Restaurar copias locales desde git history. Revertir imports en dashboard y Edge Functions a sus paths locales. Revertir handlers `_business` en `process-email-outbox`. El paquete `apps/shared/email-templates/` se puede dejar (no rompe si no se importa). `git revert` del PR.

---

## PR #4 — config-aware-core

**Spec**: `specs/config-aware-core/spec.md`
**Migrations**: `supabase/migrations/20260724012000_add_business_settings_booking_knobs.sql`
**Files**: migración, contract tests, `create_public_booking` RPC con knobs, `_read_business_booking_config` helper, dashboard error codes + types/mappers/gateway
**Estimated lines**: ~390 → real: 430 (28 sobre el presupuesto, ver 4.5.7)
**Dependencia**: PR #3 (usa shared package para notificaciones)

### Fase 4.1 — Migración: add business_settings knobs (RED → GREEN)

- [x] 4.1.1 Crear contract test `supabase/checks/20260724012000_add_booking_knobs.contract.test.mjs`.
       **RED**: ejecutar → falla (columnas no existen).
- [x] 4.1.2 Crear migración con las 4 columnas + helper `_read_business_booking_config` + redefinición de `create_public_booking` con lectura de knobs y validaciones.
       **GREEN**: contract test → 100% pasa.
- [x] 4.1.3 REFACTOR: verificar idempotencia, defaults seguros.

**Commit**: `feat(db): add booking config knobs to business_settings`

### Fase 4.2 — RPC: create_public_booking lee knobs (RED → GREEN)

- [x] 4.2.1 Crear test `supabase/checks/20260724012000_booking_respects_knobs.contract.test.mjs`.
       **RED**: ejecutar → falla (RPC no lee knobs).
- [x] 4.2.2 RPC actualizada: lee knobs de `_read_business_booking_config()`, valida `min_notice` y `max_advance`, aplica buffers prep/post.
       **GREEN**: contract test → 100% pasa.
- [x] 4.2.3 REFACTOR: lógica de knobs extraída en `_read_business_booking_config(business_id)`.

**Commit**: incluido en migración 4.1

### Fase 4.3 — Slot availability: respetar buffers (RED → GREEN)

- [x] 4.3.1 Contract test extendido: verifica buffer prep 10min, post 15min en `_assert_no_slot_conflict`.
       **RED**: escenarios de buffer fallan en test.
- [x] 4.3.2 `create_public_booking` aplica buffers via `v_effective_start` / `v_effective_end` + `_assert_no_slot_conflict`.
       **GREEN**: contract test → 100% pasa.
- [x] 4.3.3 REFACTOR: buffers integrados en el flujo principal de redefinición.

**Commit**: incluido en migración 4.1

### Fase 4.4 — Error codes: BOOKING_TOO_SOON y BOOKING_TOO_FAR_ADVANCE (RED → GREEN)

- [x] 4.4.1 Test `public-booking-error-messages.spec.ts` actualizado con 2 nuevos tests.
       **RED**: test falla (códigos no definidos).
- [x] 4.4.2 RPC: `RAISE EXCEPTION` con `BOOKING_TOO_SOON` y `BOOKING_TOO_FAR_ADVANCE` (via `_raise_rpc`).
- [x] 4.4.3 `public-booking-error-messages.ts` — Agregadas entradas para los 2 códigos.
- [x] 4.4.4 `types.ts` y `mappers.ts` — Tipados y mapeados los nuevos error codes. `real-gateway.ts` — HTTP 422 para ambos.
       **GREEN**: 5/5 tests unitarios pasan.
- [x] 4.4.5 REFACTOR: mensajes en español, sin leaks de detalles internos.

**Commit**: `feat(booking): add BOOKING_TOO_SOON and BOOKING_TOO_FAR_ADVANCE error codes`

### Fase 4.5 — Verificación final PR #4

- [x] 4.5.1 Contract tests: 14 tests en total (7+7) — 100% pasan.
- [x] 4.5.2 Test unitario `public-booking-error-messages.spec.ts` — 5/5 pasan.
- [x] 4.5.3 `pnpm build` desde `apps/dashboard/` — verificado.
- [x] 4.5.4 Deno check: `process-email-outbox/index.ts` no modificado en este PR.
- [x] 4.5.5 Todos los 55 contract tests pasan (1.0.1 + PR1-4).
- [x] 4.5.6 E2E: knobs leídos, buffers aplicados en slot conflict.
- [x] 4.5.7 **⚠️ Línea 430**: diff real 430 líneas (28 sobre presupuesto). Compuesto por migración+RPC (338) + error codes dashboard (92). Divisible en PR #4a + PR #4b si se requiere split.

### DoD PR #4

- [x] Columnas `prep_buffer_minutes`, `post_buffer_minutes`, `max_advance_days`, `auto_assign_professional` en `business_settings`
- [x] `create_public_booking` lee y aplica los 4 knobs
- [x] Slot availability respeta buffers prep y post
- [x] Errores `BOOKING_TOO_SOON` y `BOOKING_TOO_FAR_ADVANCE` definidos y mapeados (HTTP 422)
- [x] `auto_assign_professional` se lee pero no asigna (v1)
- [x] Sin branches por `business_type` en código (ADR-014)
- [x] `pnpm build` dashboard + contract tests pasan
- [x] 55 contract tests intactos (incluyendo 1.0.1)
- [x] ⚠️ Diff: 430 líneas (28 sobre presupuesto). Sugerencia: PR #4a (migración+RPC, 338) + PR #4b (error codes, 92)

### Rollback PR #4

Revertir RPC/helper a versión pre-knobs. Dropear las 4 columnas nuevas de `business_settings`. No tocar `min_notice_minutes`. `git revert` del PR.

---

## PR #5 — roadmap-cleanup

**Spec**: `specs/roadmap-cleanup/spec.md`
**Files**: `openspec/changes/release-1-0-1/roadmap.md` (nuevo)
**Estimated lines**: ~50
**Dependencia**: Ninguna técnica (documentación); puede mergear en cualquier orden. Por convención, último PR.

### Fase 5.1 — Crear roadmap.md (RED → GREEN)

- [ ] 5.1.1 **RED**: `ls openspec/changes/release-1-0-1/roadmap.md` → archivo no existe.
- [ ] 5.1.2 Crear `openspec/changes/release-1-0-1/roadmap.md` con:
       - Tabla de releases: 1.0.1 (✅ cerrado — landing + emails), 1.0.2 (🔄 en curso — limpieza arquitectónica), 1.0.3 (📋 planeado — multi-profesional), 1.0.4+ (❓ por definir)
       - Sección "Cambio de estrategia": abandono del modelo per-rubro (releases por vertical) en favor de releases transversales por capacidad. Diferenciación por `business_settings` JSON (ADR-014).
       - Tabla comparativa antes/después del roadmap (como en `proposal.md:122-129`).
       **GREEN**: archivo existe, `wc -l` > 20 líneas.
- [ ] 5.1.3 Verificar que la referencia en `openspec/changes/release-1-0-1/tasks.md:5` (`> **Roadmap público**: ...`) resuelve correctamente al nuevo archivo.
       **GREEN**: ruta relativa desde raíz del repo resuelve.

**Commit**: `docs: create release roadmap with current status and strategy change`

### Fase 5.2 — Verificación final PR #5

- [ ] 5.2.1 `ls openspec/changes/release-1-0-1/roadmap.md` → existe y no está vacío.
- [ ] 5.2.2 `grep "1.0.2" openspec/changes/release-1-0-1/roadmap.md` → describe "limpieza de deuda arquitectónica".
- [ ] 5.2.3 `grep "1.0.3" openspec/changes/release-1-0-1/roadmap.md` → describe "multi-profesional".
- [ ] 5.2.4 Archivo contiene sección de abandono per-rubro y referencia a ADR-014.
- [ ] 5.2.5 Cero cambios de código en este PR (solo markdown). `git diff --stat` → solo `roadmap.md`.

### DoD PR #5

- [ ] `openspec/changes/release-1-0-1/roadmap.md` existe
- [ ] Tabla incluye releases 1.0.1 al 1.0.4+
- [ ] 1.0.2 descrito como "limpieza arquitectónica" (este release)
- [ ] 1.0.3 descrito como "multi-profesional"
- [ ] Sección de abandono del modelo per-rubro presente
- [ ] Referencia de `tasks.md:5` resuelve sin enlace roto
- [ ] Cero cambios de código

### Rollback PR #5

Eliminar `openspec/changes/release-1-0-1/roadmap.md`. `git revert` del commit.

---

## Reglas de avance

- **Force-chained**: PR #1 → #2 → #3 → #4 → #5. Cada PR mergeable independientemente después del anterior.
- Cada fase es un commit atómico. Si una fase crece >400 líneas modificadas, se splittea antes de pedir review.
- **TDD estricto**: tests primero en cada fase (RED → GREEN → REFACTOR). Nunca escribir implementación antes del test que falla.
- Conventional commits: `feat(...)`, `refactor(...)`, `chore(...)`, `docs(...)`. Sin `Co-Authored-By:` ni atribución AI.
- **400-line budget**: PR #4 tiene riesgo de exceder. Si implementación real >400 líneas, split en PR #4a (migración + RPC) y PR #4b (error codes + Edge Function). Verificar durante apply, no después.
- Si build o tests rompen durante una fase, corregir antes de avanzar.
- Los 21 contract tests de 1.0.1 deben seguir pasando en cada PR.
- **Plan de rollback por PR**: documentado en cada sección. Revertir migraciones en orden inverso (M3 → M2 → M1). `git revert` por PR.
