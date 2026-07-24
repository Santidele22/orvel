# Propuesta: Release 1.0.2 — Limpieza de deuda arquitectónica

## Intención

El audit estratégico del 2026-07-24 identificó deriva arquitectónica en Orvel que contradice decisiones ya tomadas: tokens de tema por-rubro cuando la decisión es tema único, templates de email duplicados entre dashboard y Edge Functions, y cero modelado de comportamiento por-rubro vía config. Este release limpia esas tres fuentes de deuda antes de encarar multi-profesional en 1.0.3. No agrega features de producto — solo endereza lo que ya debería estar derecho.

La referencia de arquitectura está en `~/santi/company-os/gestion-de-turnos/decisions/`, particularmente ADR-001 (scope), ADR-008 (YAGNI storage), y ADR-014 (diferenciación por config JSON, no por código).

## Alcance

### Incluido

**A. single-theme-cleanup** — Eliminar tokens de tema por-rubro del schema y runtime. Orvel tiene un solo tema (`zen`) para todos los rubros. Se remueve la columna `business_types.theme_key` con migración y se simplifica el resolver de tema en dashboard para que siempre devuelva `zen` sin lookup.

**B. email-templates-shared** — Consolidar templates de email duplicados. La copia del dashboard (`apps/dashboard/src/app/core/notifications/templates/appointment-email-templates.ts`, 166 líneas) y la de Edge Functions (`supabase/functions/_shared/templates/appointment-templates.ts`, 232 líneas) tienen el mismo propósito con implementaciones divergentes. Se crea `apps/shared/email-templates/` como source of truth única. Ambas runtimes importan del mismo paquete.

**C. business-types-promoted** — Agregar columna `is_promoted` a `business_types` para filtrar rubros en landing y signup. Migración marca 4 promovidos (Uñas, Masajes, Barbería, Peluquería) y 4 no-promovidos (Pestañas, Cejas, Spa, Otro). Landing muestra solo promovidos. Signup muestra promovidos + "Otro". Sin UI de admin para toggle.

**D. config-aware-core** — Booking core y notificaciones leen `business_settings` JSON para personalizar comportamiento por negocio. Knobs iniciales: `prep_buffer_minutes`, `post_buffer_minutes`, `min_notice_minutes` (ya existe pero ahora se respeta), `max_advance_days`, `auto_assign_professional`. Sin branches por `business_type` en código (consistente con ADR-014).

**E. roadmap-cleanup** — Crear `openspec/changes/release-1-0-1/roadmap.md` con el estado actualizado del roadmap: 1.0.2 = Limpieza arquitectónica (este release), 1.0.3 = Multi-profesional, 1.0.4+ por definir post-1.0.3. El archivo no existe en disco actualmente y se referencia desde `tasks.md:5` — esto cierra esa inconsistencia. Sin cambios de código, es documentación.

### Fuera de alcance

- Multi-profesional (tabla professionals, horarios, UI de selección) — release 1.0.3
- Walk-ins — diferido
- Pagos / MercadoPago — diferido
- WhatsApp como canal — diferido
- Turnos recurrentes — diferido
- Lista de espera — diferido
- Per-rubro theming — eliminado en spec A de este release
- Nuevos rubros — no se agregan
- UI de admin para toggle `is_promoted` — no en v1

## Capacidades

### Capacidades nuevas

- `theme-single-source`: un solo tema (`zen`) para todos los rubros, sin columnas ni resolvers de lookup
- `email-templates-unified`: templates de email con un solo source of truth en `apps/shared/email-templates/`
- `business-types-promotion`: catálogo de rubros con flag `is_promoted`, filtrado en landing y signup
- `config-aware-booking-core`: booking core lee `business_settings` JSON para buffers, notice, advance, auto-assign
- `roadmap-single-source`: `openspec/changes/release-1-0-1/roadmap.md` existe como source of truth del roadmap, referenciado desde `tasks.md:5`

### Capacidades modificadas

- `envio-email-outbox`: se elimina el branch muerto `template_key.endsWith("_business")` en `process-email-outbox/index.ts:453` y los handlers explícitos de `*_business` en líneas 441-444
- `landing-rubros-honestos` (creada en 1.0.1): el filtro de rubros en landing y signup pasa a leer `is_promoted` de la base en vez de estar hardcodeado en componentes Astro
- `catalogo-rubros`: `business_types` pierde `theme_key`, gana `is_promoted`

## Enfoque

Release liviano, migración-heavy, cero features nuevas de producto. Cuatro specs independientes que se pueden implementar en paralelo pero comparten el mismo schema (migraciones secuenciales). Las specs A y C tocan schema; B y D tocan runtime. La spec D es la de mayor riesgo porque modifica el core de booking.

**Estrategia de PRs** (force-chained, ≤400 líneas/PR):
- PR #1: single-theme-cleanup (migración + dashboard resolver)
- PR #2: business-types-promoted (migración + landing/signup)
- PR #3: email-templates-shared (nuevo paquete + migración de imports)
- PR #4: config-aware-core (migración `business_settings` knobs + RPC + Edge Function)
- PR #5: roadmap-cleanup (crear `roadmap.md` con estado actualizado, sin código)

## Áreas afectadas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `supabase/migrations/20260608010000_core_catalog_source_of_truth.sql` | Modificado | ALTER TABLE: remover `theme_key`, agregar `is_promoted` y seeds |
| `supabase/migrations/` (nuevo) | Nuevo | Migración `202607XXXX00_add_business_settings_knobs.sql`: `prep_buffer_minutes`, `post_buffer_minutes`, `max_advance_days`, `auto_assign_professional` en `business_settings` |
| `apps/dashboard/src/app/core/theming/dashboard-business-rules.ts` | Modificado | Simplificar: remover `THEME_BY_BUSINESS_TYPE`, devolver siempre `zen` |
| `apps/dashboard/src/app/core/theming/dashboard-theme-palettes.tokens.ts` | Modificado | Conservar solo palette `zen`, eliminar alias no usados |
| `apps/dashboard/src/app/core/notifications/templates/appointment-email-templates.ts` | Eliminado | Migrar imports a `@orvel/shared/email-templates` |
| `supabase/functions/_shared/templates/appointment-templates.ts` | Eliminado | Migrar imports a `apps/shared/email-templates/` |
| `apps/shared/email-templates/` | Nuevo | Paquete workspace con source of truth unificado de templates |
| `supabase/functions/process-email-outbox/index.ts:441-457` | Modificado | Eliminar handlers `*_business` (líneas 441-444) y catch-all `_business` (línea 453-456) |
| `supabase/functions/create-public-booking/` | Modificado | Leer `business_settings` knobs para buffers, notice, advance |
| `apps/landing/src/components/organisms/Features.astro` | Modificado | Filtrar tarjetas por `is_promoted = true` desde API (o catálogo estático) |
| `apps/landing/src/pages/auth/signup/onboarding.astro` | Modificado | Selectores de rubro filtrados por `is_promoted = true` + "Otro" |
| `apps/landing/src/pages/auth/signup/account.astro` | Modificado | Selectores de rubro filtrados por `is_promoted = true` + "Otro" |
| `openspec/changes/release-1-0-1/roadmap.md` | Nuevo | Crea el archivo de roadmap consolidado con el estado actual (1.0.2 = cleanup, 1.0.3 = multi-prof, etc) |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| Migración de datos en `business_types.theme_key`: column drop falla si hay constraints o vistas dependientes | Media | Verificar dependencias con `\d+ business_types` antes de la migración; si hay vistas, recrearlas después del drop |
| Templates consolidados pierden comportamiento de la copia de Edge Functions (tiene `business_notification` y `business_cancellation` que el dashboard no tiene) | Media | La copia canónica DEBE incluir todos los templates de ambas runtimes. Los templates `_business` se conservan como funciones exportadas (el router de process-email-outbox los llama si existen registros en outbox) |
| `prep_buffer_minutes` y `post_buffer_minutes` no existen hoy en `business_settings`; agregarlos cambia la firma de consultas que leen esa tabla | Baja | Se agregan con `DEFAULT` (0 y 0 respectivamente); las consultas existentes usan `SELECT *` o columnas explícitas — verificar cada query antes de deploy |
| `auto_assign_professional` es un knob sin implementación en v1 (la tabla `professionals` no existe) | Baja | El knob se agrega como columna con default `false`; el código lo lee pero no actúa (no hay profesionales que asignar). Se activa en 1.0.3 |
| El change combinado de 4 specs excede el presupuesto de revisión de 400 líneas por PR | Alta | Force-chained: 4 PRs encadenados, cada uno ≤400 líneas. PR #1 (theme) ~120 líneas; PR #2 (promoted) ~150 líneas; PR #3 (templates) ~200 líneas; PR #4 (config) ~300 líneas |

## Plan de rollback

- **single-theme-cleanup**: revertir migración que dropea `theme_key`; si la columna ya no existe, recrearla con `DEFAULT 'default'`. El resolver del dashboard se revierte al lookup original.
- **business-types-promoted**: revertir migración de `is_promoted`. Componentes Astro vuelven a filter hardcodeado pre-1.0.2.
- **email-templates-shared**: revertir imports en dashboard y Edge Function a sus copias locales. El paquete `apps/shared/email-templates/` se puede dejar (no rompe nada si no se importa).
- **config-aware-core**: las nuevas columnas en `business_settings` tienen defaults seguros (0, 0, 30, false); revertir la lógica que las lee en `create_public_booking` sin dropear las columnas (son inocuas con defaults).
- **_business branch en process-email-outbox**: en vez de eliminar el código, se convierte en no-op con un comentario `// Dead branch kept for rollback safety; no business outbox records exist post-1.0.1`. Si hay que revertir, se restaura la lógica.

## Dependencias

- **Internas**: Release 1.0.1 (PR #1 landing + PR #2 emails) ya está mergeado y aplicado en prod. Los 21 contract tests de 1.0.1 deben seguir pasando.
- **Externas**: ninguna.
- **Hacia adelante**: Release 1.0.3-multi-profesional depende de este release. La spec D (`config-aware-core`) prepara el terreno para `auto_assign_professional` y los buffers que 1.0.3 necesita.

## Criterios de éxito

- [ ] `business_types.theme_key` eliminada; columna `is_promoted` existe con 4 = true (uñas, masajes, barberia, peluqueria) y 4 = false (pestañas, cejas, spa, otro)
- [ ] `THEME_BY_BUSINESS_TYPE` removido de `dashboard-business-rules.ts`; el tema es siempre `zen`
- [ ] Templates de email tienen un solo source of truth en `apps/shared/email-templates/`; dashboard y Edge Function importan del mismo paquete (sin copias locales divergentes)
- [ ] `process-email-outbox/index.ts` no tiene handlers `_business` activos (convertidos a no-op o eliminados)
- [ ] Landing muestra solo 4 rubros promovidos en Features (Uñas, Masajes, Barbería, Peluquería)
- [ ] Signup (onboarding + account) muestra 5 opciones: 4 promovidos + "Otro"
- [ ] `create_public_booking` lee `prep_buffer_minutes`, `post_buffer_minutes`, `min_notice_minutes`, `max_advance_days` de `business_settings` y los aplica (con defaults si no están seteados)
- [ ] No existen branches por `business_type` en el código (consistente con ADR-014: la diferenciación es por config, no por tipo)
- [ ] Los 21 contract tests de 1.0.1 siguen pasando (migraciones, atomicidad, paginación)
- [ ] Build de dashboard y landing no rompe
- [ ] Deploy de Edge Functions no rompe (imports resueltos desde `apps/shared/`)
- [ ] `openspec/changes/release-1-0-1/roadmap.md` existe y refleja el estado actual (1.0.2 cleanup, 1.0.3 multi-prof, 1.0.4+ por definir)

## Impacto en roadmap

El roadmap de releases se reestructuró en el audit del 2026-07-24:

| Release | Antes (per-rubro) | Ahora (cleanup → features) |
|---------|-------------------|---------------------------|
| 1.0.1 | Landing + emails | (ya entregado) |
| **1.0.2** | **Uñas independiente** | **Limpieza de deuda arquitectónica (este release)** |
| 1.0.3 | Masajes independiente | Multi-profesional |
| 1.0.4+ | Per-rubro | Por definir post-1.0.3 |

El modelo per-rubro (releases independientes por vertical) se abandona. A partir de 1.0.2, los releases son de capacidades transversales. La diferenciación por rubro se logra vía `business_settings` JSON (ADR-014), no vía branches de release.
