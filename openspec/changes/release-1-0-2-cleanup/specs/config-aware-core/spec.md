# Config aware booking core

## Propósito

Convierte el booking core y las notificaciones en comportamiento consciente de la configuración del negocio, leyendo knobs desde `business_settings` JSON (o columnas equivalentes) en lugar de ramas hardcodeadas por `business_type`. Los knobs iniciales son `prep_buffer_minutes`, `post_buffer_minutes`, `min_notice_minutes` (ya presente, ahora respetado), `max_advance_days` y `auto_assign_professional`. Consistente con ADR-014: diferenciación por config, no por código.

## Requisitos

### Requisito: Nuevas columnas en business_settings

La tabla `business_settings` DEBE ganar cuatro columnas adicionales con defaults seguros: `prep_buffer_minutes INT DEFAULT 0`, `post_buffer_minutes INT DEFAULT 0`, `max_advance_days INT DEFAULT 30`, `auto_assign_professional BOOLEAN DEFAULT false`. La columna `min_notice_minutes` ya existe y ahora DEBE ser respetada por el booking core.

#### Escenario: Migración agrega las cuatro columnas

- DADO que la tabla `business_settings` existe con `min_notice_minutes` y sin las otras cuatro columnas
- CUANDO se ejecuta la migración que agrega las columnas nuevas
- ENTONCES existen cinco columnas operativas: `min_notice_minutes`, `prep_buffer_minutes`, `post_buffer_minutes`, `max_advance_days`, `auto_assign_professional`
- Y todas tienen defaults no nulos (`0`, `0`, `30`, `false` respectivamente)

#### Escenario: Filas existentes mantienen defaults seguros

- DADO que la tabla `business_settings` tiene filas existentes para negocios activos
- CUANDO se ejecuta la migración
- ENTONCES cada fila existente tiene `prep_buffer_minutes = 0`, `post_buffer_minutes = 0`, `max_advance_days = 30`, `auto_assign_professional = false`
- Y la columna `min_notice_minutes` conserva su valor previo

### Requisito: Buffer prep y post aplicado al slot

La RPC `create_public_booking` DEBE leer `prep_buffer_minutes` y `post_buffer_minutes` de `business_settings` del negocio objetivo. Si `prep_buffer_minutes > 0`, el slot DEBE estar bloqueado durante esos minutos anteriores al turno. Si `post_buffer_minutes > 0`, el slot DEBE estar bloqueado durante esos minutos posteriores al turno.

#### Escenario: Negocio con prep_buffer_minutes = 10 bloquea 10 minutos previos

- DADO que un negocio tiene `prep_buffer_minutes = 10` en `business_settings`
- CUANDO se intenta reservar un turno a las 14:00
- ENTONCES ningún otro turno puede existir en el rango 13:50 a 14:00 (10 minutos de buffer prep)
- Y el sistema rechaza reservas conflictivas con mensaje que referencia el buffer

#### Escenario: Negocio con post_buffer_minutes = 15 bloquea 15 minutos posteriores

- DADO que un negocio tiene `post_buffer_minutes = 15` en `business_settings`
- CUANDO se reserva un turno a las 14:00
- ENTONCES ningún otro turno puede existir en el rango 14:00 a 14:15 (15 minutos de buffer post)
- Y el sistema rechaza reservas conflictivas con mensaje que referencia el buffer

#### Escenario: Negocio sin buffer configurado opera sin restricción adicional

- DADO que un negocio tiene `prep_buffer_minutes = 0` y `post_buffer_minutes = 0`
- CUANDO se reserva un turno
- ENTONCES no se aplica buffer adicional (solo la duración del turno cuenta para bloqueo de slot)

### Requisito: Validación de min_notice_minutes respetada

La RPC `create_public_booking` DEBE leer `min_notice_minutes` de `business_settings` y rechazar reservas cuyo inicio esté a menos de esa cantidad de minutos del momento actual.

#### Escenario: Reserva a 5 minutos es rechazada con min_notice_minutes = 120

- DADO que un negocio tiene `min_notice_minutes = 120` en `business_settings`
- CUANDO un cliente intenta reservar un turno para dentro de 5 minutos
- ENTONCES la RPC retorna error con código que indica violación de `min_notice_minutes`
- Y no se crea ningún turno ni intent de email

#### Escenario: Reserva dentro del notice permitido es aceptada

- DADO que un negocio tiene `min_notice_minutes = 120`
- CUANDO un cliente intenta reservar un turno para dentro de 3 horas (180 minutos)
- ENTONCES la RPC procede con la creación del turno

### Requisito: Validación de max_advance_days respetada

La RPC `create_public_booking` DEBE leer `max_advance_days` de `business_settings` y rechazar reservas cuyo inicio esté a más de esa cantidad de días en el futuro.

#### Escenario: Reserva a 60 días es rechazada con max_advance_days = 30

- DADO que un negocio tiene `max_advance_days = 30` en `business_settings`
- CUANDO un cliente intenta reservar un turno para dentro de 60 días
- ENTONCES la RPC retorna error con código que indica violación de `max_advance_days`
- Y no se crea ningún turno ni intent de email

#### Escenario: Reserva a 20 días es aceptada con max_advance_days = 30

- DADO que un negocio tiene `max_advance_days = 30`
- CUANDO un cliente intenta reservar un turno para dentro de 20 días
- ENTONCES la RPC procede con la creación del turno (dentro del horizonte permitido)

### Requisito: auto_assign_professional no actúa en v1

La columna `auto_assign_professional` DEBE existir con default `false` y ser leída por el booking core. En esta versión (pre-1.0.3), el código DEBE leer la columna pero NO DEBE asignar profesionales automáticamente, dado que la tabla `professionals` aún no existe. El knob queda plantado para activarse en 1.0.3.

#### Escenario: Negocio sin auto_assign_professional set mantiene default false

- DADO que un negocio no tiene `auto_assign_professional` configurado explícitamente
- CUANDO se ejecuta la lectura desde la RPC
- ENTONCES el valor leído es `false` y no hay asignación de profesional

#### Escenario: Negocio con auto_assign_professional = true no asigna en v1

- DADO que un negocio tiene `auto_assign_professional = true` en `business_settings`
- CUANDO se ejecuta `create_public_booking`
- ENTONCES la columna se lee pero ningún profesional es asignado
- Y el turno queda con `professional_id = NULL` o sin el campo, según schema actual
