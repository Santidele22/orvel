# Diseño técnico — Release 1.0.1

## Decisiones de diseño

### template_key para cancelación al cliente

Se usa `appointment_cancelled`. En `process-email-outbox/index.ts:445` el routing rastrea tanto `appointment_cancelled` como `booking_cancelled`, pero el trigger lifecycle (migración `20260628120000`) ya usa `appointment_confirmation` para confirmación al cliente y `booking_created_business`/`booking_cancelled_business` para business. Para mantener consistencia con el naming del trigger lifecycle, se adopta `appointment_cancelled` como template_key canónico para cancelación al cliente.

La función que renderiza existe: `renderAppointmentCancellationEmail` en `_shared/templates/appointment-templates.ts:88`.

### Límite de paginación para notificaciones durables

Default: `50`. Justificación:

- El dashboard muestra notificaciones en una lista vertical; 50 entradas llenan ~3 pantallas en desktop y requieren scroll. Es un número que un humano puede ojear sin sentirse abrumado.
- La tabla `dashboard_notifications` no tiene un índice compuesto por `business_id + created_at DESC`; consultas sin límite escanean más filas de las necesarias a medida que crece el historial.
- Se adopta paginación basada en cursor (created_at + id), no offset-based, para evitar el problema de offset drift cuando se archivan notificaciones entre páginas.

### Frontera entre trigger y create_public_booking

Actualmente existen DOS caminos que escriben notificaciones y emails:

1. **`create_public_booking`** (RPC, migración `20260708234500`): maneja booking público self-service. Escribe booking, customer, outbox (business + customer best-effort), dashboard_notifications best-effort.
2. **`handle_booking_notifications`** (trigger AFTER INSERT/UPDATE, migración `20260628120000`): maneja bookings creados por admin y lifecycle events. Escribe dashboard_notification y outbox.

**Decisión**: mantener los dos caminos. El trigger ya tiene un guard `IF NEW.source = 'client-self-service' THEN RETURN NEW` (de `20260629234000`) que evita duplicación para bookings públicos. Para bookings de admin, el trigger sigue siendo el mecanismo correcto. Ambos caminos se modifican de forma paralela para implementar la nueva atomicidad y relajación del outbox del dueño.

## Plan de migraciones (ordenado)

Cada migración es un archivo SQL envuelto en `BEGIN; ... COMMIT; NOTIFY pgrst, 'reload schema';`.

| # | Archivo | Propósito |
|---|---------|-----------|
| 1 | `202607XXXX00_harden_dashboard_notifications_required.sql` | Hace obligatoria la notificación durable: modifica `create_public_booking` y `handle_booking_notifications` para que `dashboard_notifications` sea atómica con la operación. Si la inserción falla, la transacción se revierte. Cambia `EXCEPTION WHEN OTHERS THEN RAISE LOG` por `RAISE` (o simplemente saca el bloque try-catch) en `create_public_booking`. En el trigger, la notificación durable pasa a escribirse antes del outbox y sin `ON CONFLICT DO NOTHING` silencioso. |
| 2 | `202607XXXX01_relax_business_email_outbox.sql` | Relaja `BUSINESS_EMAIL_OUTBOX_REQUIRED`: elimina las inserciones de outbox del dueño en `create_public_booking` y en `handle_booking_notifications` (eventos INSERT y UPDATE cancel). Elimina el `IF v_business_email_rows < 1 THEN RAISE 'BUSINESS_EMAIL_OUTBOX_REQUIRED'`. |
| 3 | `202607XXXX02_add_customer_cancellation_email.sql` | Agrega email de cancelación al cliente en `handle_booking_notifications` cuando se cancela un turno. En el bloque `TG_OP = 'UPDATE' AND NEW.status = 'cancelled'`, agrega un `PERFORM _enqueue_booking_lifecycle_email` con `template_key = 'appointment_cancelled'` y `recipient_role = 'booking_user'`. |

### Orden de deploy

1 → 2 → 3. No puede intercambiarse:

- Si 2 se ejecuta antes que 1, existe una ventana donde ni el email del dueño ni la notificación durable son obligatorios.
- Si 3 se ejecuta antes que 1, el email de cancelación al cliente se envía pero la notificación durable del dueño para cancelación sigue siendo best-effort.

## Atomicidad

### Write triple

booking + intent email cliente + dashboard_notification. La operación debe ser:
- Todo visible en la misma transacción (PostgreSQL `BEGIN`/`COMMIT`)
- Si cualquiera de los tres INSERTs falla (constraint, disco, deadlock), la transacción se revierte
- No hay compensación fuera de la transacción

### Dónde vive

| Camino | Ubicación |
|--------|-----------|
| `create_public_booking` (booking público) | Dentro de la función RPC en PL/pgSQL. El `BEGIN`/`COMMIT` lo maneja el invocador. |
| `handle_booking_notifications` (admin booking, lifecycle) | El trigger se ejecuta dentro de la transacción del INSERT/UPDATE sobre `bookings`. Si el trigger falla, la operación sobre bookings se revierte automáticamente. |

### Protección contra duplicados

- `dashboard_notifications` no tiene unique constraint sobre `(appointment_id, event_type)`. Se implementa: en `create_public_booking` se reemplazan los INSERTs existentes (con `WHERE NOT EXISTS`) con INSERT directos SIN supresión de error. Si el INSERT falla por duplicado, se deja que la excepción propague y revierta la transacción.
- En el trigger, se elimina `ON CONFLICT DO NOTHING` de la inserción de `dashboard_notifications` en `handle_booking_notifications`.

### Caminos específicos

**Creación** (booking público y admin):
1. INSERT booking → si falla, error del RPC/trigger
2. INSERT dashboard_notification → si falla, transacción revierte, booking no queda creado
3. INSERT outbox email cliente (si tiene email) → si falla, transacción revierte
4. No hay INSERT outbox dueño

**Cancelación**:
1. UPDATE booking SET status = 'cancelled'
2. INSERT dashboard_notification con event_type = 'appointment.cancelled' → si falla, transacción revierte
3. INSERT outbox email cliente (appointment_cancelled, si tiene email) → si falla, transacción revierte
4. No hay INSERT outbox dueño

**Reprogramación**:
1. UPDATE booking SET starts_at
2. INSERT dashboard_notification con event_type = 'appointment.rescheduled' → si falla, transacción revierte
3. INSERT outbox email cliente (appointment_rescheduled, si tiene email y cambió starts_at) → si falla, transacción revierte
4. No hay INSERT outbox dueño

### Semántica de fallo

Todas las fallas de base de datos (constraint, disco, deadlock, serialización) revierten la transacción. El invocador (dashboard Angular o landing) recibe el error del RPC (para booking público) o la excepción del trigger (para admin), y muestra un mensaje de error. No hay inconsistencia silenciosa.

## Cambios en templates de email

### Templates que mueren

- `booking_created_business` (sinónimo `appointment_created_business`) — ya no se envía al dueño en eventos ordinarios
- `booking_cancelled_business` (sinónimo `appointment_cancelled_business`) — ya no se envía al dueño en cancelación
- Templates de reschedule al dueño — no existían explícitamente pero cualquier template que finalice en `_business` para eventos ordinarios queda eliminado

### Templates que se agregan

- `appointment_cancelled` para el cliente en cancelación — la función `renderAppointmentCancellationEmail` ya existe en `_shared/templates/appointment-templates.ts`

### Templates que se conservan

- `appointment_confirmation` — confirmación al cliente en creación
- `booking_rescheduled` / `appointment_rescheduled` — confirmación al cliente en reprogramación
- `appointment_reminder_24h` — recordatorio (fuera de alcance del release pero el template existe)
- `signup_email_confirmation`, `business_welcome`, `welcome_email` — emails críticos de cuenta (se conservan)
- Cualquier template de cuenta/seguridad/billing (fuera del alcance de relajación del outbox)

### Cambios en routing de process-email-outbox

`process-email-outbox/index.ts` ya soporta todos los template keys necesarios vía el routing existente (líneas 433-456). No necesita cambios de routing porque:

- `appointment_cancelled` ya tiene handler (línea 445-448)
- Simplemente dejarán de llegar registros con template keys business (`*_business`) al outbox, porque no se insertarán más. El handler `template_key.endsWith('_business')` (línea 453) queda como código muerto pero no causa problemas: si no hay registros, no se ejecuta.

Se recomienda, como limpieza **futura** (no necesaria para 1.0.1), eliminar el branch `_business` del routing.

## Cambios en dashboard

### DashboardNotificationsService

`apps/dashboard/src/app/core/notifications/dashboard-notifications.service.ts`:

- **Paginación obligatoria**: `refreshForAdmin()` debe pasar un `limit` a `listAdminNotifications`.
- **Límite por defecto**: 50. Se pasa como constante `DEFAULT_NOTIFICATIONS_LIMIT`.
- **Carga inicial**: solo las primeras 50 notificaciones. Se agrega un botón/paginación "Cargar más" o infinite scroll para la siguiente página.
- **Cursor**: se usa `created_at` de la última notificación visible como cursor. La API acepta `cursor` opcional.

### Internal API

`apps/dashboard/src/app/core/notifications/internal-dashboard-notifications.api.ts`:

- `ListAdminNotificationsInput` gana dos campos opcionales:
  ```ts
  limit?: number;     // default 50
  cursor?: string;    // ISO timestamp del created_at de la última notificación cargada
  cursorId?: string;  // id de la última notificación (desempate)
  ```
- `listAdminNotifications()` agrega `.limit(input.limit ?? 50)` y filtro `created_at < cursor` si `cursor` está presente.
- El `select('*')` se cambia por `select('*', { count: 'exact', head: false })` para exponer el total opcionalmente, pero no es obligatorio en el primer release.

### Contrato de servicio

`refreshForAdmin()` se actualiza para aceptar `cursor` opcional. Se agrega un método `loadMore()` que llama `refreshForAdmin` con el cursor de la última notificación cargada, y concatena resultados.

## Plan de edición de landing

### Features.astro

**Eliminar** 4 tarjetas: Spas & Masajes, Tattoo Studios, Cejas y Pestañas. **Conservar** solo Uñas (Nail Salons, línea 67-81) y Barberías (línea 33-47). La tarjeta de Peluquerías (línea 16-30) también se elimina de la sección pública. El grid pasa de `lg:grid-cols-3` a `lg:grid-cols-2`.

Referencia de reincorporación: agregar comentario `<!-- Peluquería se reincorpora en release 1.0.6 -->` al inicio del archivo.

### FAQ.astro

**Modificar** la respuesta del primer FAQ (índice 0, línea 6): cambiar `"Está diseñada para peluquerías, barberías, salones de uñas, pestañas, spas, masajes, wellness y cualquier negocio que trabaje con turnos."` por `"Está diseñada para barberías, salones de uñas y cualquier negocio que trabaje con turnos."`. **Conservar** el resto de FAQs intactos.

### Problem.astro

**Modificar** la tarjeta de recordatorios (tercera columna, línea 29-35): cambiar `"Envío automático de confirmaciones y recordatorios por WhatsApp."` por `"Envío automatizado de confirmaciones y recordatorios. Reducí ausencias y protegé la rentabilidad de tu salón."`. Se elimina el ícono de WhatsApp (`ri-whatsapp-line`, línea 31) y se reemplaza por un ícono neutro (`ri-notification-line` o similar). El título "Recordatorios inteligentes" se conserva.

### HowItWorks.astro

**Modificar** la card de "Protección de ingresos" (línea 13-18): cambiar `"Cobro de seña online. Reducimos el ausentismo."` por `"Recordatorios automáticos para reducir ausencias."`. El título cambia a "Recordatorios automáticos". El ícono cambia de `ri-shield-check-fill` a `ri-alarm-warning-line` o similar.

### CTA.astro

**Modificar** la línea 17: cambiar `"En 5 minutos tu link de reservas estará activo y listo para cobrar pagos por seña."` por `"En 5 minutos tu link de reservas estará activo y listo para recibir turnos."`.

### Audience.astro

**Modificar** la tarjeta "Match Perfecto": eliminar el tercer ítem de la lista (línea 30-35) `"Querés delegar la fricción de los cobros online."`. Se elimina el `<li>` completo. **Conservar** los dos primeros ítems y la tarjeta "Descartado" sin cambios.

### Layout.astro (SEO)

**Modificar** la línea 13: cambiar `description` de `"Gestioná turnos y clientes con Orvel, el software simple para salones de belleza, peluquerías y centros de estética."` a `"Gestioná turnos y clientes con Orvel, el software simple para barberías y salones de uñas."`. Aplica también a OG y Twitter descriptions (líneas 35, 42).

### signup/onboarding.astro

**Modificar** el fieldset de rubros: eliminar 4 labels:
- `<label ... value="spa">Spa</label>` (línea 19)
- `<label ... value="pestanas">Pestañas</label>` (línea 20)
- `<label ... value="cejas">Cejas</label>` (línea 21)
- `<label ... value="masajes">Masajes</label>` (línea 22)

**Conservar**: Peluquería (línea 16), Uñas (línea 17), Barbería (línea 18), Otro (línea 23).

### signup/account.astro

**Modificar** el fieldset de rubros: eliminar 3 labels:
- `<label ... value="estetica">Estética</label>` (línea 84-86)
- `<label ... value="spa">Spa</label>` (línea 88-90)
- `<label ... value="maquillaje">Maquillaje</label>` (línea 92-94)

**Conservar**: Peluquería (línea 72), Barbería (línea 76), Uñas (línea 80), Otro (línea 96).

### Orden de edición recomendado

No hay dependencias entre componentes. Se pueden editar en cualquier orden. Se recomienda este orden para minimizar conflictos de merge:
1. Layout.astro (SEO) — archivo compartido por toda la landing
2. Features.astro — el cambio más grande (4 tarjetas eliminadas)
3. FAQ.astro
4. Problem.astro
5. HowItWorks.astro
6. CTA.astro
7. Audience.astro
8. onboarding.astro
9. account.astro

## Límite de PRs

### PR #1: Landing (~150 líneas)

**Archivos**: solo `apps/landing/`.

| Archivo | Cambio | Líneas |
|---------|--------|--------|
| `Features.astro` | Eliminar 4 tarjetas, ajustar grid | -45 |
| `FAQ.astro` | Modificar primer FAQ | -1, +1 |
| `Problem.astro` | Modificar tarjeta recordatorios | -2, +2 |
| `HowItWorks.astro` | Modificar card protección ingresos | -3, +3 |
| `CTA.astro` | Modificar copy | -1, +1 |
| `Audience.astro` | Eliminar ítem lista | -4 |
| `Layout.astro` | Modificar descriptions (x3) | -3, +3 |
| `onboarding.astro` | Eliminar 4 labels de fieldset | -4 |
| `account.astro` | Eliminar 3 labels de fieldset | -3 |

Total estimado: ~120 líneas modificadas, ~60 eliminadas.

### PR #2: Emails (~250 líneas)

**Archivos**: `supabase/migrations/` (3 archivos nuevos), `apps/dashboard/`.

| Archivo | Cambio | Líneas |
|---------|--------|--------|
| `202607XXXX00_harden_dashboard_notifications_required.sql` | Nuevo | ~50 |
| `202607XXXX01_relax_business_email_outbox.sql` | Nuevo | ~40 |
| `202607XXXX02_add_customer_cancellation_email.sql` | Nuevo | ~20 |
| `internal-dashboard-notifications.api.ts` | Agregar limit, cursor a query | ~25 |
| `dashboard-notifications.service.ts` | Agregar paginación, loadMore | ~45 |
| `dashboard-notifications.api.ts` (interface) | Extender `ListAdminNotificationsInput` | ~5 |

Total estimado: ~185 líneas nuevas/modificadas.

### Contratos compartidos

Las funciones `_booking_lifecycle_email_payload`, `_enqueue_booking_lifecycle_email`, `handle_booking_notifications` y `_resolve_booking_business_email` se modifican tanto en la migración 1 como en la 2 y 3. Cada migración redefine `CREATE OR REPLACE FUNCTION` con la versión correcta para ese paso.

**Orden de merge**: PR #2 mergea primero (altera contratos de base de datos que no afectan la landing). PR #1 mergea después. Si hay conflictos, son solo en archivos disjuntos (nunca tocan los mismos archivos).

### Riesgo post-merge

Entre PR #1 y PR #2 no hay riesgo funcional porque la landing y el backend no comparten archivos ni contratos. La landing es puramente Astro/estática; los cambios en el backend son migraciones y TypeScript del dashboard. El único punto de integración es el signup (onboarding/account), que solo cambia opciones de UI — el RPC `complete_signup_onboarding` acepta cualquier valor de rubro.

## Testing

### Coverage por área

| Área | Qué se prueba | Cómo |
|------|---------------|------|
| Landing | Features renderiza 2 tarjetas, FAQ sin rubros falsos, Problem sin WhatsApp, CTA sin señas, Audience sin cobros online, SEO sin peluquería | Playwright E2E: visitar landing, hacer assert del DOM por texto ausente/presente |
| Signup | Selector de onboarding y account tienen exactamente 4 opciones (incluye peluquería) | Playwright E2E: navegar a `/auth/signup/plan` → seleccionar plan → llegar a account → validar checkboxes |
| Creación booking atómica | Dado un booking exitoso, existe dashboard_notification + outbox email cliente | Test de integración: ejecutar `create_public_booking`, verificar `dashboard_notifications` y `notification_email_outbox` |
| Cancelación con email al cliente | Dado un booking cancelado con email de cliente, existe outbox con `appointment_cancelled` | Test: cancelar booking vía admin RPC, verificar outbox |
| Sin email al dueño | Booking creado/cancelado NO tiene outbox con template `*_business` | Test: ejecutar operación, verificar que no existen registros business |
| Dashboard notificaciones paginadas | Llamar a `listAdminNotifications` sin limit explícito devuelve ≤ 50 filas | Test unitario: mock de Supabase query, verificar `.limit()` |
| Rollback atómico | Si dashboard_notification falla, booking no se crea | Test: forzar error en inserción (constraint violada), verificar que booking no existe |

### Lo que NO se crea

No se crea un nuevo framework de testing. Los tests existentes usan:
- **Playwright** para E2E (ya configurado en el monorepo)
- **Pruebas de integración SQL** para migraciones (se ejecutan contra la base de datos de pruebas)

Se recomienda agregar los nuevos tests a la suite existente identificable por `*.spec.ts` o `*.e2e.ts` en los directorios correspondientes.
