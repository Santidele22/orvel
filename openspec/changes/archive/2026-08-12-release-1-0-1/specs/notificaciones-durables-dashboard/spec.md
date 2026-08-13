# Notificaciones durables del dashboard

## Propósito

Especifica la persistencia obligatoria de notificaciones durables para el dueño en cada evento del ciclo de vida del turno, con atomicidad transaccional y preparación para paginación.

## Requisitos

### Requisito: Atomicidad de persistencia

El sistema DEBE persistir en una sola transacción atómica: (1) el turno, (2) el intent de email de confirmación al cliente, y (3) la notificación durable del dashboard del dueño. Si cualquiera de los tres falla, la operación completa falla y se revierte.

#### Escenario: Creación exitosa con los tres persistidos

- DADO que existe un negocio con email configurado y un cliente reserva un turno
- CUANDO se ejecuta la creación del turno
- ENTONCES la transacción persiste el turno, el intent de email al cliente y la notificación durable en `dashboard_notifications`
- Y los tres registros son visibles inmediatamente en la misma transacción

#### Escenario: Reprogramación exitosa con los tres persistidos

- DADO que existe un turno confirmado
- CUANDO el cliente o el dueño reprograman el turno
- ENTONCES la transacción actualiza el turno, persiste el intent de email al cliente y la notificación durable con `event_type = 'appointment.rescheduled'`

#### Escenario: Cancelación exitosa con los tres persistidos

- DADO que existe un turno confirmado
- CUANDO el turno es cancelado
- ENTONCES la transacción marca el turno como cancelado, persiste el intent de email al cliente y la notificación durable con `event_type = 'appointment.cancelled'`

### Requisito: Fallo de inserción de notificación durable

El sistema DEBE fallar la operación completa si la inserción de la notificación durable en `dashboard_notifications` falla, independientemente del motivo.

#### Escenario: Inserción de notificación falla por error de base de datos

- DADO que se intenta crear un turno
- CUANDO la inserción del turno y el intent de email al cliente son exitosos pero la inserción en `dashboard_notifications` falla
- ENTONCES la transacción completa se revierte
- Y el turno NO queda creado
- Y el intent de email al cliente NO queda persistido
- Y el sistema devuelve un error al invocador

#### Escenario: Inserción de notificación falla por constraint violada

- DADO que se intenta crear un turno
- CUANDO existe ya una notificación con el mismo `appointment_id` y `event_type`
- ENTONCES la inserción de la notificación falla por constraint
- Y la operación completa se revierte

### Requisito: Independencia de Realtime

La notificación durable DEBE estar disponible mediante consulta directa a la base de datos sin depender de la conexión Realtime. Realtime solo notifica cambios; la recarga o reconexión DEBE recuperar la misma notificación.

#### Escenario: Notificación visible sin Realtime conectado

- DADO que se creó un turno exitosamente con su notificación durable
- CUANDO el dashboard del dueño se carga sin conexión Realtime activa
- ENTONCES la notificación aparece en la lista de notificaciones

### Requisito: Paginación y límites en consultas

El sistema DEBE aplicar un límite explícito a todas las consultas de notificaciones del dashboard. Las consultas SIN límite están prohibidas.

#### Escenario: Listado de notificaciones con límite

- DADO un dueño con más de 50 notificaciones
- CUANDO consulta sus notificaciones
- ENTONCES la respuesta contiene como máximo el límite configurado de notificaciones
- Y se incluye un cursor o token para la página siguiente

#### Escenario: Consulta sin límite es rechazada

- DADO que se intenta ejecutar una consulta de notificaciones sin parámetro de límite
- CUANDO la consulta se ejecuta
- ENTONCES el sistema aplica un límite por defecto
- Y la consulta NO devuelve todas las filas sin acotar

### Requisito: Tipos de evento cubiertos

El sistema DEBE generar notificaciones durables para los siguientes eventos: `appointment.created`, `appointment.rescheduled`, `appointment.cancelled`.

#### Escenario: Notificación generada para cada tipo de evento

- DADO un turno en cada estado del ciclo de vida
- CUANDO ocurre un evento de creación, reprogramación o cancelación
- ENTONCES se persiste una notificación durable con el `event_type` correspondiente
