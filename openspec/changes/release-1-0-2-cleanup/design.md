# Diseño técnico — Release 1.0.2 Cleanup

## Enfoque técnico

Tres migraciones ordenadas preparan catálogo y booking antes de sus consumidores. El catálogo queda gobernado por `business_types`; booking expande conflictos desde `business_settings`; los emails comparten ESM puro. Cada tarea aplica RED → GREEN → REFACTOR.

## Decisiones de diseño

| Tema | Elección | Alternativa | Motivo |
|---|---|---|---|
| Dependencias de `theme_key` | Preflight manual en `tasks.md`: `\d+ public.business_types` y revisar vistas. | Detector automático. | Hay pocas vistas; evita DDL dinámico. Dependencias pendientes abortan la transacción. |
| Runtime de templates | ESM TypeScript puro, imports explícitos, APIs Web, sin Node ni build propio. | Bundles Node/Deno. | Ambas runtimes consumen la misma fuente. |
| Cuatro promovidos | Actualizar por PK `code IN ('unas','masajes','barberia','peluqueria')`; nunca label/slug. | Nombre o slug. | `code` es estable, único y normalizado. |
| Configuración | Columnas tipadas `prep_buffer_minutes`, `post_buffer_minutes`, `max_advance_days`, `auto_assign_professional`; `min_notice_minutes` ya existe. | JSON genérico. | Mejores tipos, constraints, RLS y consultas; ADR-014 exige config, no JSON. |
| Errores de horizonte | `BOOKING_TOO_SOON` y `BOOKING_TOO_FAR_ADVANCE`, HTTP 422 y mensajes seguros. | `SLOT_CONFLICT`. | Distingue política temporal de concurrencia. |
| Referencia de roadmap | Crear `openspec/changes/release-1-0-1/roadmap.md`; `tasks.md:5` queda igual. | Mover la referencia. | La ruta existente es correcta. |

## Plan de migraciones (ordenado)

| # | Archivo | Propósito y SQL exacto | Dependencia |
|---|---|---|---|
| 1 | `supabase/migrations/20260724010000_add_business_types_is_promoted.sql` | `ADD COLUMN IF NOT EXISTS is_promoted boolean NOT NULL DEFAULT false`; resetear todas a false, promover los cuatro `code`; redefinir `get_dashboard_reference_catalog()` incluyendo `is_promoted`. | Antes de 2 y de la landing. |
| 2 | `supabase/migrations/20260724011000_drop_business_types_theme_key.sql` | Redefinir primero `get_dashboard_reference_catalog()` sin `theme_key`; luego `DROP COLUMN IF EXISTS theme_key`; recargar schema. | Después de 1; antes del dashboard sin `themeKey`. |
| 3 | `supabase/migrations/20260724012000_add_business_settings_booking_knobs.sql` | `ADD COLUMN IF NOT EXISTS` para cuatro columnas `NOT NULL`, defaults `0`, `0`, `30`, `false` y checks `>= 0`; redefinir `create_public_booking` y crear `_assert_no_configured_slot_conflict`. | Antes de publicar booking/dashboard. |

No hay más migraciones; las históricas no se editan.

## Atomicidad / side effects

- M1 conserva las ocho filas: el default deja todas en false y el `UPDATE` por `code` deja exactamente cuatro true.
- M2 pierde intencionalmente solo valores obsoletos de `theme_key`; ninguna otra columna/fila cambia. El preflight bloquea dependencias no tratadas.
- M3 rellena filas existentes con defaults y conserva `min_notice_minutes`. Ventana efectiva: `[starts_at-(buffer_minutes+prep), ends_at+(buffer_minutes+post))`; lock y validación coinciden. Notice/horizon se validan antes de customer, booking y outbox: no dejan escrituras. `auto_assign_professional` se lee, pero `professional_id` sigue `NULL`.

## Cambios en código

- **single-theme-cleanup**: `apps/dashboard/src/app/core/theming/dashboard-business-rules.ts`, `apps/dashboard/src/app/core/theming/dashboard-theme-palettes.tokens.ts`, `apps/dashboard/src/app/core/theming/theme.tokens.ts`, `apps/dashboard/src/app/core/catalog/reference-catalog.ts` y contratos; todo resuelve `zen`.
- **business-types-promoted**: nuevo `apps/landing/src/lib/business-types.ts`; `apps/landing/src/components/organisms/Features.astro`, `apps/landing/src/pages/auth/signup/onboarding.astro`, `apps/landing/src/pages/auth/signup/account.astro`; catálogo/fallback y tests exponen `isPromoted`.
- **email-templates-shared**: paquete nuevo; borrar copias locales; cambiar imports en dashboard, `supabase/functions/process-email-outbox/index.ts`, `supabase/functions/_shared/process-email-outbox-helpers.ts` y tests; remover routing `_business`, conservar renderers.
- **config-aware-core**: migración RPC/helper; actualizar `apps/dashboard/src/app/core/api/supabase-booking/types.ts`, `apps/dashboard/src/app/core/api/supabase-booking/mappers.ts`, ambos gateways y `apps/dashboard/src/app/features/booking/pages/public/public-booking-error-messages.ts`. `appointment-reminders-24h` no cambia: su RPC ya lee el flag.
- **roadmap-cleanup**: crear solo `openspec/changes/release-1-0-1/roadmap.md`.

## Shared package structure

`apps/shared/email-templates/` contiene `package.json` (`@orvel/shared`, export `./email-templates`), `index.ts`, `appointment-template.types.ts`, `appointment-templates.ts` y tests. Nombres `kebab-case`; renderers `renderAppointment…Email`. Se registra en `pnpm-workspace.yaml`, `package.json` y `apps/dashboard/package.json`; dashboard importa `@orvel/shared/email-templates`. Deno usa `../../../apps/shared/email-templates/index.ts`. Los paths viejos son re-exports temporales y se borran tras migrar consumidores.

## Orden de deploy

1. M1 `is_promoted`.
2. M2 drop `theme_key` tras preflight manual.
3. M3 knobs/RPC.
4. Build y deploy de dashboard y landing.
5. Deploy de `process-email-outbox` y verificación Deno.
6. Crear/mergear `roadmap.md`.

## Plan de rollback

M1: revertir consumidores/RPC y dropear `is_promoted`. M2: recrear `theme_key text NOT NULL DEFAULT 'default'`, restaurar por `code` los valores `beauty`/`wellness`/`default` y el RPC previo. M3: revertir RPC/helper, luego dropear las cuatro columnas; no tocar `min_notice_minutes`. Código: `git revert` por PR. Templates: reactivar re-exports/copias antes de revertir imports.

## Estrategia de testing

| Spec | RED primero |
|---|---|
| Tema único | Unit resolver/palette/catalog; contrato SQL de drop y ocho filas; build dashboard. |
| Promovidos | Unit normalización/fallback; DB exactos 4/4 por `code`; E2E cuatro cards y cinco opciones. |
| Templates | Goldens Vitest+Deno del HTML; contrato de única fuente/imports; integración outbox. |
| Config core | Unit códigos/mensajes; SQL defaults, notice, horizon, buffers, rollback y concurrencia; E2E booking aceptado/rechazado sin side effects. |
| Roadmap | Contrato de existencia, releases y enlace de `tasks.md:5`. |

## Threat Matrix

N/A — no cambia routing, shell, subprocess, VCS, clasificación de ejecutables ni integración de procesos.

## PR slicing (force-chained)

Se ajusta el orden para respetar migraciones: #1 `business-types-promoted` ~300 líneas; #2 `single-theme-cleanup` ~240; #3 `email-templates-shared` ~330 (movimiento detectado como rename); #4 `config-aware-core` ~390, límite estricto; #5 `roadmap-cleanup` ~50. Cada PR incluye sus RED tests, rollback y pasa build; si #4 supera 400 líneas reales, `sdd-tasks` debe partirlo antes de apply.

## Preguntas abiertas

Ninguna.
