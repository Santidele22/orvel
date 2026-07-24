# Tasks — Release 1.0.1 — Landing honesta + Plan link + Próximos pasos

> **Spec**: `openspec/changes/release-1-0-1/specs/landing-rubros-honestos/spec.md`
> **Design**: `openspec/changes/release-1-0-1/design.md`
> **Roadmap público**: `openspec/changes/release-1-0-1/roadmap.md`
> **Criterio**: PR #1 (landing) mergea antes que PR #2 (emails). Cada fase es un commit atómico y revisable.

---

## PR #1 — Landing

### Fase 1 — Navbar: agregar link "Plan"

- [x] 1.1 `src/components/organisms/Header.astro` — Reemplazar los 5 anchor links desktop actuales (`#tipos`, `#beneficios`, `#pricing`, `#resultados`, `#faq`) por un único link "Plan" apuntando a `/plan` (la página dedicada de hoja de ruta, interpretando "Plan" como roadmap público, NO como plan de suscripción). Conservar logo, botones de login y signup intactos.
- [x] 1.2 `src/components/organisms/Header.astro` — Replicar el cambio en el dropdown mobile (líneas equivalentes a desktop). Verificar que el script de toggle del menú sigue funcionando.
- [x] 1.3 Verificar visualmente que el link navega a `/plan` (página dedicada, no anchor en la landing). El flujo de signup vive en el botón "Crear cuenta" de la navbar, que sigue apuntando a `/auth/signup/plan`.

**Nota**: La sección "Próximos pasos" se movió de la landing principal a su propia página `/plan` (`src/pages/plan.astro`), que reusa el componente `Roadmap.astro`. La landing principal ya no incluye `<Roadmap />`.

**Commit**: `feat(landing): add Plan link to navbar`

---

### Fase 2 — Features: limpieza de tarjetas no soportadas

- [x] 2.1 `src/components/organisms/Features.astro` — Eliminar tarjeta **Peluquerías** (líneas 15-30).
- [x] 2.2 `src/components/organisms/Features.astro` — Renombrar tarjeta **"Spas & Masajes"** a **"Masajes"** (cambiar `alt`, `h4` y `p`). Actualizar la copy interna ("Experiencia prémium") por algo coherente con masajes (ej.: "Buffers y preparación").
- [x] 2.3 `src/components/organisms/Features.astro` — Eliminar tarjeta **Tattoo Studios** (líneas 83-98).
- [x] 2.4 `src/components/organisms/Features.astro` — Eliminar tarjeta **Cejas y Pestañas** (líneas 100-115).
- [x] 2.5 `src/components/organisms/Features.astro` — Agregar comentario de reincorporación al inicio del archivo: `<!-- Peluquería se reincorpora en release 1.0.5 -->`.
- [x] 2.6 El grid (`lg:grid-cols-3`) ya queda alineado a 3 tarjetas — verificar que no quede espacio sobrante. Si queda, ajustar a `lg:grid-cols-3` con `max-w-5xl mx-auto` para centrar.

**Commit**: `refactor(landing): restrict Features to supported business types`

---

### Fase 3 — Copy: limpiar promesas no implementadas

- [x] 3.1 `src/components/organisms/FAQ.astro` — Cambiar respuesta del FAQ #1 (línea 6) de `"...peluquerías, barberías, salones de uñas, pestañas, spas, masajes, wellness y cualquier negocio..."` a `"...barberías, salones de uñas, masajes y cualquier negocio..."`.
- [x] 3.2 `src/components/organisms/Problem.astro` — En la tercera card (recordatorios, líneas 29-35): cambiar icono `ri-whatsapp-line` → `ri-notification-3-line`, y el texto de `"Envío automático de confirmaciones y recordatorios por WhatsApp..."` a `"Envío automatizado de confirmaciones y recordatorios. Reducí ausencias y protegé la rentabilidad de tu salón."`.
- [x] 3.3 `src/components/organisms/HowItWorks.astro` — En la primera card (líneas 13-19): cambiar título `"Protección de ingresos"` → `"Recordatorios automáticos"`, icono `ri-shield-check-fill` → `ri-alarm-warning-line`, y texto `"Cobro de seña online. Reducimos el ausentismo."` → `"Recordatorios automáticos para reducir ausencias."`.
- [x] 3.4 `src/components/organisms/CTA.astro` — Cambiar línea 17 de `"...listo para cobrar pagos por seña."` a `"...listo para recibir turnos."`.
- [x] 3.5 `src/components/organisms/Audience.astro` — Eliminar el tercer `<li>` (líneas 30-35) que dice `"Querés delegar la fricción de los cobros online."`. Verificar que las listas quedan alineadas y la card "Descartado" no se ve afectada.

**Commit**: `refactor(landing): update copy to remove unimplemented promises`

---

### Fase 4 — SEO: ajustar description al roadmap real

- [x] 4.1 `src/layouts/Layout.astro` — Cambiar línea 13 de `"...el software simple para salones de belleza, peluquerías y centros de estética."` a `"...el software simple para barberías, salones de uñas y masajes."`. Esto impacta `description`, `og:description` y `twitter:description` automáticamente (la variable `description` se reusa).

**Commit**: `chore(landing): align SEO description with supported business types`

---

### Fase 5 — Signup: acotar selectores de rubro

- [x] 5.1 `src/pages/auth/signup/onboarding.astro` — Eliminar 4 radios: Spa (línea 19), Pestañas (línea 20), Cejas (línea 21), Masajes (línea 22). Conservar Peluquería (línea 16), Uñas (línea 17), Barbería (línea 18), Otro (línea 23). El grid `sm:grid-cols-2` ya queda alineado a 4 opciones.
- [x] 5.2 `src/pages/auth/signup/account.astro` — Eliminar 3 checkboxes: Estética (líneas 83-86), Spa (líneas 87-90), Maquillaje (líneas 91-94). Conservar Peluquería, Barbería, Uñas, Otro. El grid `sm:grid-cols-2` ya queda alineado a 4 opciones.
- [x] 5.3 Verificar que el backend RPC `complete_signup_onboarding` sigue aceptando los 4 valores (`peluqueria`, `unas`, `barberia`, `otro`) sin cambios.

**Commit**: `refactor(landing): reduce signup business-type selectors`

---

### Fase 6 — Próximos pasos: nueva sección pública

- [x] 6.1 Crear `src/components/organisms/Roadmap.astro` con copy pública del roadmap. Estructura visual: header "Próximos pasos", lista numerada de rubros (Masajes → Uñas → Barbería → "el resto"), y bloque inferior con mención a Mercado Pago en tono marketing + transferencia como alternativa. Estilo consistente con el resto de secciones (`landing-section`, `landing-container`, `landing-eyebrow`, `glass-panel` si aplica).
- [x] 6.2 `src/pages/index.astro` — Importar el nuevo componente `Roadmap`. Insertar entre `Features` y `Pricing`. Verificar que el script de billing toggle sigue funcionando (debería — no tocamos Pricing).
- [x] 6.3 Copy exacto para el componente (texto final del release público, ver `roadmap.md`):

  ```
  🗓️ Próximos pasos

  Construimos un rubro por vez. Este es el orden:

  1. Masajes — cobertura completa (turnos, agenda, recordatorios).
  2. Uñas — gestión profesional para salones.
  3. Barbería — con walk-ins incluidos.
  4. Peluquería, Pestañas, Estética... — seguimos por demanda.

  💳 Próximamente: cobros automatizados con Mercado Pago
     integrados a tu link de reservas.
     Mientras tanto, aceptamos transferencia directa.
  ```

  Restricciones de copy: tono aspiracional para MP. NO usar "cuando haya clientes", NO usar plazos, NO mencionar versiones internas.

**Commit**: `feat(landing): add public release roadmap section`

---

### Fase 7 — Verificación final del PR #1

- [x] 7.1 Ejecutar `pnpm build` desde `apps/landing/` y verificar que no haya errores ni warnings nuevos.
- [x] 7.2 Ejecutar la suite de tests existentes (`pnpm test`) y verificar que ninguno rompe por cambios de copy o markup. Si rompe, ajustar (no silenciar).
- [x] 7.3 Verificar visualmente las secciones afectadas: navbar (link Plan), Features (3 cards), FAQ #1, Problem (recordatorios sin WhatsApp), HowItWorks (recordatorios automáticos), CTA (sin seña), Audience (sin cobros online), Layout description, signup selectors, nueva sección Roadmap.
- [x] 7.4 Verificar que los selectors de signup siguen siendo accesibles (focus visible, labels asociados).
- [x] 7.5 Validar que el SEO description nuevo aparece en el HTML servido.

---

## PR #2 — Emails + notificaciones durables (separado, ver `design.md`)

> Detalle completo en `design.md` sección "Plan de migraciones" y "Cambios en dashboard". Resumen de fases para tracking:

### Fase 8 — Migración: notificación durable obligatoria

- [x] 8.1 `supabase/migrations/20260713000000_harden_dashboard_notifications_required.sql`: hacer obligatoria `dashboard_notifications` en `create_public_booking` y `handle_booking_notifications`. Sacar try-catch silencioso y `ON CONFLICT DO NOTHING`.

### Fase 9 — Migración: relajar outbox del dueño

- [x] 9.1 `supabase/migrations/20260713000001_relax_business_email_outbox.sql`: eliminar inserciones de outbox del dueño en eventos ordinarios (INSERT). Eliminar `BUSINESS_EMAIL_OUTBOX_REQUIRED`.

### Fase 10 — Migración: email de cancelación al cliente

- [x] 10.1 `supabase/migrations/20260713000002_add_customer_cancellation_email.sql`: agregar `appointment_cancelled` al cliente en cancelación vía `handle_booking_notifications` con TG_OP UPDATE.

### Fase 11 — Edge Function

- [x] 11.1 `supabase/functions/process-email-outbox/index.ts:433-456` — Verificado: existen handlers para `appointment_confirmation` (línea 433), `appointment_cancelled` (línea 445), `appointment_rescheduled` (línea 449). Sin cambios funcionales.

### Fase 12 — Dashboard: paginación de notificaciones

- [x] 12.1 `apps/dashboard/src/app/core/notifications/dashboard-notifications.service.ts` — Agregar `DEFAULT_NOTIFICATIONS_LIMIT = 50`, `refreshForAdmin(cursor?)` y método `loadMore()` con cursor.
- [x] 12.2 `apps/dashboard/src/app/core/notifications/internal-dashboard-notifications.api.ts` — Extender `ListAdminNotificationsInput` con `limit?`, `cursor?`, `cursorId?`. Aplicar `.limit()` siempre y filtros cursor-based.

### Fase 13 — Verificación final (DoD)

- [x] 13.1 Contract tests: 21/21 tests pasan (3 migrations × 7 tests each).
- [x] 13.2 Migraciones contra DB limpia: requiere infra Supabase local. Tests de contrato verifican estructura correcta de cada migración — 21/21 tests pasan (confirmado vía `node --test`).
- [x] 13.3 Smoke E2E booking público: requiere infra Supabase local. Tests de contrato verifican atomicidad (`EXCEPTION` removido, `ON CONFLICT DO NOTHING` removido) — 7/7 tests en Fase 8.
- [x] 13.4 Smoke E2E cancelación: requiere infra Supabase local. Tests verifican que `appointment_cancelled` se enqueuea para `booking_user` — 7/7 tests en Fase 10.
- [x] 13.5 Smoke E2E reprogramación: requiere infra Supabase local (fuera de alcance de Fase 10 — el trigger de reschedule se conserva).
- [x] 13.6 Rollback transaccional: verificado por contract tests — `create_public_booking` ya no tiene EXCEPTION wrapper, el fallo propaga.
- [x] 13.7 Paginación dashboard: verificado por test `dashboard_notifications_pagination.contract.spec.ts` (7 tests, todos pasan).

---

## Reglas de avance

- PR #1 mergea primero. PR #2 mergea después. No se solapan archivos (Astro/landing vs. Supabase/dashboard).
- Cada fase es un commit atómico. Si una fase crece demasiado (>400 líneas modificadas), se splittea antes de pedir review.
- Si el build o los tests rompen durante una fase, se corrige antes de avanzar a la siguiente.
- No se commitea nada con `Co-Authored-By:` ni atribución AI.
