# Email templates shared

## Propósito

Consolida los templates de email duplicados entre el dashboard y las Edge Functions en un único source of truth en `apps/shared/email-templates/`, eliminando divergencia entre las dos implementaciones paralelas y reduciendo la superficie de mantenimiento a un solo paquete workspace.

## Requisitos

### Requisito: Paquete compartido único

DEBE existir un paquete workspace `apps/shared/email-templates/` que exporta todos los templates de email de notificaciones de turnos, combinando el set completo de la copia del dashboard (booking confirmation, reschedule, cancellation) y la copia de Edge Functions (`business_notification`, `business_cancellation`, `_business` variants). Ninguna runtime DEBE mantener su propia copia local del template canónico.

#### Escenario: Dashboard importa desde paquete compartido

- DADO que existe `apps/shared/email-templates/index.ts` exportando los templates
- CUANDO el dashboard necesita renderizar un email de booking confirmation
- ENTONCES importa desde `@orvel/shared/email-templates`
- Y el bundle del dashboard no incluye una copia local del template

#### Escenario: Edge Function importa desde paquete compartido

- DADO que existe `apps/shared/email-templates/` accesible desde `supabase/functions/`
- CUANDO la Edge Function `process-email-outbox` necesita renderizar un email
- ENTONCES importa desde la ruta relativa del paquete compartido
- Y la Edge Function no incluye una copia local del template

### Requisito: Cero copias locales divergentes

Los archivos `apps/dashboard/src/app/core/notifications/templates/appointment-email-templates.ts` y `supabase/functions/_shared/templates/appointment-templates.ts` DEBEN ser eliminados del repositorio. Ningún otro archivo puede contener lógica de render de templates de email; solo se importa del paquete compartido.

#### Escenario: Archivos de copia local eliminados

- DADO que la migración a paquete compartido está completa
- CUANDO se inspecciona el sistema de archivos
- ENTONCES el archivo `apps/dashboard/src/app/core/notifications/templates/appointment-email-templates.ts` no existe
- Y el archivo `supabase/functions/_shared/templates/appointment-templates.ts` no existe
- Y ningún archivo fuera de `apps/shared/email-templates/` contiene funciones de render de email

### Requisito: Templates _business conservados para outbox histórico

Los templates `business_notification` y `business_cancellation` DEBEN estar disponibles como funciones exportadas en el paquete compartido, para que el router de `process-email-outbox` los pueda llamar si existen registros en `outbox` con `template_key` tipo `*_business`. La rama muerta `template_key.endsWith("_business")` en `process-email-outbox/index.ts:453` y los handlers explícitos de líneas 441-444 DEBEN ser eliminados o convertidos en no-ops con comentario de rollback safety.

#### Escenario: Handlers _business eliminados del router

- DADO que la Edge Function `process-email-outbox` está actualizada
- CUANDO se inspecciona el archivo `process-email-outbox/index.ts`
- ENTONCES no existe un catch-all para `template_key.endsWith("_business")` en línea 453
- Y no existen handlers explícitos `*_business` en líneas 441-444
- Y los templates `_business` siguen disponibles como exports en el paquete compartido

### Requisito: Equivalencia funcional entre runtimes pre y post cambio

El HTML producido por el dashboard y por la Edge Function para el mismo evento DEBE ser idéntico al de la versión pre-cambio o tener un diff aceptable documentado (cambios de whitespace o de orden de atributos permitidos, cambios de contenido prohibidos).

#### Escenario: Booking confirmation idéntico pre y post cambio

- DADO que el dashboard renderiza un booking confirmation con datos de turno X, cliente Y, negocio Z
- CUANDO se compara el HTML antes y después del cambio al paquete compartido
- ENTONCES el contenido visible al cliente es idéntico (asunto, saludo, datos del turno, footer)
- Y no hay regresión en el contenido del email

#### Escenario: Edge Function produce HTML equivalente

- DADO que la Edge Function renderiza una notificación con los mismos datos de turno X, cliente Y, negocio Z
- CUANDO se compara el HTML pre-cambio (de `appointment-templates.ts`) y post-cambio (del paquete compartido)
- ENTONCES el HTML es funcionalmente equivalente (mismo contenido semántico)
- Y cualquier diff menor está documentado en el PR
