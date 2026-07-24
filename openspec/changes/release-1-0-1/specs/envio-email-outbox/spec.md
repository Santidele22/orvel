# Envío de email por outbox

## Propósito

Especifica la relajación del contrato `BUSINESS_EMAIL_OUTBOX_REQUIRED` y la eliminación de emails ordinarios al dueño en eventos de turno, manteniendo emails críticos de cuenta y seguridad.

## Requisitos

### Requisito: Relajación de BUSINESS_EMAIL_OUTBOX_REQUIRED

El sistema DEBE dejar de exigir la inserción exitosa en `notification_email_outbox` para el email del dueño como condición de éxito de la operación. El outbox del dueño pasa a best-effort.

(Previo: la operación fallaba con `BUSINESS_EMAIL_OUTBOX_REQUIRED` si no se podía insertar el email del dueño en el outbox.)

#### Escenario: Operación exitosa sin email del dueño en outbox

- DADO que se crea un turno para un negocio cuyo email no puede insertarse en el outbox
- CUANDO se ejecuta la creación
- ENTONCES la operación es exitosa
- Y el turno queda creado
- Y la notificación durable del dashboard se persiste
- Y no se eleva el error `BUSINESS_EMAIL_OUTBOX_REQUIRED`

#### Escenario: Email del dueño en outbox es best-effort

- DADO que se crea un turno
- CUANDO el sistema intenta insertar el email del dueño en el outbox
- ENTONCES si la inserción falla, la operación continúa
- Y el fallo se registra en log para diagnóstico

### Requisito: Eliminación de emails ordinarios al dueño

El sistema NO DEBE enviar email ordinario al dueño en eventos de creación, reprogramación ni cancelación de turnos.

#### Escenario: Sin email al dueño en creación

- DADO que se crea un turno
- CUANDO se completa la operación
- ENTONCES no se inserta ningún registro en `notification_email_outbox` con `template_key = 'appointment_created_business'` para el dueño

#### Escenario: Sin email al dueño en reprogramación

- DADO que se reprograma un turno
- CUANDO se completa la operación
- ENTONCES no se inserta ningún registro en `notification_email_outbox` con template de reprogramación para el dueño

#### Escenario: Sin email al dueño en cancelación

- DADO que se cancela un turno
- CUANDO se completa la operación
- ENTONCES no se inserta ningún registro en `notification_email_outbox` con template de cancelación para el dueño

### Requisito: Orden de migración

La migración DEBE ejecutarse en este orden obligatorio: (1) hacer obligatoria la notificación durable con atomicidad, (2) relajar `BUSINESS_EMAIL_OUTBOX_REQUIRED`.

#### Escenario: Migración en orden correcto

- DADO que se despliegan las migraciones
- CUANDO la migración de notificación durable obligatoria se ejecuta primero
- Y luego la migración de relajación del outbox se ejecuta
- ENTONCES el sistema funciona correctamente con notificaciones durables obligatorias y outbox del dueño relajado

#### Escenario: Migración en orden incorrecto es detectable

- DADO que se intenta relajar `BUSINESS_EMAIL_OUTBOX_REQUIRED` antes de hacer obligatoria la notificación durable
- CUANDO se revisa el orden de las migraciones
- ENTONCES el sistema tiene un período donde ni el email del dueño ni la notificación durable son obligatorios
- Y este período DEBE ser evitado por convención de deploy

### Requisito: Emails críticos conservados

El sistema DEBE conservar el envío de emails para eventos de cuenta, seguridad, recuperación de contraseña y billing crítico.

#### Escenario: Email de recuperación de contraseña se envía

- DADO que un usuario solicita recuperación de contraseña
- CUANDO el sistema procesa la solicitud
- ENTONCES el email de recuperación se envía normalmente
- Y no es afectado por la relajación del outbox

#### Escenario: Email de bienvenida de cuenta se envía

- DADO que un nuevo usuario completa el signup
- CUANDO el sistema procesa el alta
- ENTONCES el email de confirmación de cuenta se envía

### Requisito: Cero downtime en migración

La migración NO DEBE interrumpir el servicio. Las operaciones en curso durante el deploy DEBEN completar o fallar de forma predecible.

#### Escenario: Operaciones en curso durante deploy de migración

- DADO que hay operaciones de creación de turno en curso
- CUANDO se despliega la migración de notificación durable obligatoria
- ENTONCES las operaciones que ya iniciaron antes del deploy completan con las reglas anteriores
- Y las operaciones que inician después del deploy usan las nuevas reglas

### Requisito: Función process-email-outbox sin envío a dueño

La función `process-email-outbox` NO DEBE procesar ni enviar emails para templates de eventos ordinarios del dueño (`appointment_created_business`, `appointment_rescheduled_business`, `appointment_cancelled_business`).

#### Escenario: Outbox sin templates de dueño ordinarios

- DADO que existen registros en `notification_email_outbox`
- CUANDO `process-email-outbox` los procesa
- ENTONCES los registros con template de evento ordinario del dueño son omitidos o marcados como no procesables
- Y los registros de email al cliente se procesan normalmente
