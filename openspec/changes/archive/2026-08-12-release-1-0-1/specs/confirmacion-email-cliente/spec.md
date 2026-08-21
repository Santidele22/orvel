# Confirmación de email al cliente

## Propósito

Especifica el envío de emails de confirmación al cliente en los tres eventos del ciclo de vida del turno: creación, reprogramación y cancelación. Incluye el email de cancelación al cliente, que es una brecha detectada en la exploración.

## Requisitos

### Requisito: Email de confirmación en creación

El sistema DEBE enviar un email de confirmación al cliente cuando se crea un turno, si el cliente proporcionó un email.

#### Escenario: Cliente con email recibe confirmación

- DADO que un cliente reserva un turno proporcionando su email
- CUANDO la creación del turno es exitosa
- ENTONCES se persiste un intent en `notification_email_outbox` con `template_key = 'appointment_confirmation'` y el email del cliente
- Y el email contiene los datos del turno y links de gestión

#### Escenario: Cliente sin email no genera intent

- DADO que un cliente reserva un turno sin proporcionar email
- CUANDO la creación del turno es exitosa
- ENTONCES no se persiste ningún intent de email al cliente
- Y la operación es exitosa igualmente
- Y la notificación durable del dueño se persiste

### Requisito: Email de confirmación en reprogramación

El sistema DEBE enviar un email de confirmación al cliente cuando se reprograma un turno, si el cliente proporcionó un email.

#### Escenario: Cliente recibe email de reprogramación

- DADO que existe un turno confirmado con email de cliente
- CUANDO el turno se reprograma
- ENTONCES se persiste un intent en `notification_email_outbox` con el template de reprogramación y el email del cliente
- Y el email refleja la nueva fecha y hora

#### Escenario: Reprogramación sin email de cliente

- DADO que existe un turno confirmado sin email de cliente
- CUANDO el turno se reprograma
- ENTONCES no se persiste intent de email al cliente
- Y la operación es exitosa

### Requisito: Email de cancelación al cliente

El sistema DEBE enviar un email de cancelación al cliente cuando se cancela un turno, si el cliente proporcionó un email. Este es un comportamiento nuevo; actualmente la cancelación solo notifica al dueño.

#### Escenario: Cliente recibe email de cancelación

- DADO que existe un turno confirmado con email de cliente
- CUANDO el turno es cancelado
- ENTONCES se persiste un intent en `notification_email_outbox` con `template_key` de cancelación y el email del cliente
- Y el email indica que el turno fue cancelado

#### Escenario: Cancelación sin email de cliente

- DADO que existe un turno confirmado sin email de cliente
- CUANDO el turno es cancelado
- ENTONCES no se persiste intent de email al cliente
- Y la operación es exitosa
- Y la notificación durable del dueño se persiste

### Requisito: Cancelación de turno ya cancelado

El sistema NO DEBE enviar un email de cancelación duplicado si el turno ya está cancelado.

#### Escenario: Intento de cancelación de turno ya cancelado

- DADO que existe un turno ya cancelado
- CUANDO se intenta cancelar nuevamente
- ENTONCES el sistema rechaza la operación o la trata como no-op
- Y no se genera un email de cancelación duplicado
- Y no se genera una notificación durable duplicada

### Requisito: Atomicidad del intent de email con la operación

El intent de email al cliente DEBE persistirse dentro de la misma transacción atómica que el turno y la notificación durable. Si el intent falla, la operación completa falla.

#### Escenario: Intent de email falla y la operación se revierte

- DADO que se intenta crear un turno con email de cliente
- CUANDO el intent de email al cliente falla por error de base de datos
- ENTONCES la transacción completa se revierte
- Y el turno NO queda creado

#### Escenario: Los tres persistidos atómicamente

- DADO que se crea un turno con email de cliente
- CUANDO el turno, el intent de email y la notificación durable se persisten
- ENTONCES los tres registros existen en la misma transacción
- Y si alguno falla, los tres se revierten

### Requisito: Templates de email cubiertos

El sistema DEBE tener templates de email para los siguientes eventos dirigidos al cliente: confirmación de creación, confirmación de reprogramación, confirmación de cancelación.

#### Escenario: Template de cancelación existe

- DADO que el sistema necesita enviar un email de cancelación al cliente
- CUANDO busca el template correspondiente
- ENTONCES el template de cancelación existe y contiene los datos del turno cancelado
