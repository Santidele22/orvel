# Capacity-based booking (dev branch)

Documentación técnica final para la implementación de capacidad por negocio en `dev`.

## 1) Resumen de cambios de esquema SQL

### `businesses.capacity`
- Campo: `public.businesses.capacity integer not null default 1 check (capacity >= 1)`.
- Endurecimiento de compatibilidad en migración posterior:
  - `ADD COLUMN IF NOT EXISTS capacity integer`
  - backfill: `capacity = 1` cuando `NULL` o `< 1`
  - `SET DEFAULT 1`, `SET NOT NULL`
  - constraint defensiva `businesses_capacity_check` (si no existe).

### Estados y campos de appointment/booking
- Estados permitidos: `booked | cancelled`.
- Constraint: `check (status in ('booked', 'cancelled'))`.
- Default: `status = 'booked'`.
- Campos de ventana temporal normalizados para compatibilidad:
  - `starts_at` / `ends_at` (canónicos en lógica de overlap)
  - `start_time` / `end_time` (legacy/compatibilidad, sincronizados por migración).

### Índices relevantes
- `idx_bookings_business_window` en `(business_id, starts_at, ends_at)`.
- `idx_bookings_business_status_window` en `(business_id, status, starts_at, ends_at)`.
- `idx_bookings_booked_overlap` (GiST):
  - `gist (business_id, tstzrange(starts_at, ends_at, '[)'))`
  - parcial `where status = 'booked'`.
- `idx_blocked_times_business_window` en `(business_id, starts_at, ends_at)`.

---

## 2) Comportamiento RPC `create_appointment`

Función: `public.create_appointment(p_business_id, p_start_time, p_end_time, p_service_id, p_customer_id, p_notes)`

### Atomicidad y serialización
- Bloquea fila de negocio (`FOR UPDATE`) al resolver `businesses`.
- Lock transaccional por negocio: `pg_advisory_xact_lock(hashtextextended('<business>:business'))`.
- Lock canónico por slots de 30 min en el rango solicitado:
  - `generate_series(..., interval '30 minutes')`
  - advisory lock por cada bucket (`<business>:slot:<timestamp>`).
- Resultado: intentos concurrentes en rangos solapados (ej. 10:00-11:00 y 10:30-11:30) quedan serializados.

### Lógica de overlap y capacidad
- Capacidad efectiva: `greatest(coalesce(business.capacity, 1), 1)`.
- Ocupación: count de bookings `status='booked'` con solapamiento `[)`:
  - `tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_start_time, p_end_time, '[)')`.
- Gate determinístico:
  - si `v_capacity <= v_occupied` → error `CAPACITY_FULL`
  - si hay lugar, inserta booking `status='booked'`.

### Errores de contrato
- `BOOKING_VALIDATION_ERROR`:
  - `p_business_id`, `p_start_time`, `p_end_time` nulos
  - `p_end_time <= p_start_time`
- `UNAUTHORIZED`:
  - sin `auth.uid()`
  - sin ownership/membership válido para `p_business_id`
- `BUSINESS_NOT_FOUND`:
  - negocio inexistente
- `CAPACITY_FULL`:
  - sin cupo disponible para el rango

---

## 3) Lógica de disponibilidad y payload

Función: `public.query_public_slot_availability(p_business_slug, p_service_id, p_date_iso)`

### Reglas
- Timezone fija de negocio público: `America/Argentina/Buenos_Aires`.
- Slots base en intervalos de 30 min (`slot_interval_minutes`, fallback 30).
- Respeta:
  - `working_hours` por día
  - `min_notice_minutes`
  - `buffer_minutes`
  - duración del servicio (`services.duration_minutes`, fallback 30)
- Excluye slots bloqueados por `blocked_times`.
- Ocupación por overlap contra bookings `booked`.

### Payload de salida
Retorna tabla con:
- `starts_at_iso text`
- `ends_at_iso text`
- `remaining_capacity integer`

`remaining_capacity` se calcula como `greatest(capacity - occupied, 0)` por slot de 30 minutos.

---

## 4) Ejemplos de consultas/llamadas

> Nota: ejemplos con Supabase JS RPC (`.rpc`). Ajustar UUIDs/fechas según entorno `dev`.

### A) Availability para una fecha
```ts
const { data, error } = await supabase.rpc('query_public_slot_availability', {
  p_business_slug: 'mi-salon',
  p_service_id: '11111111-1111-1111-1111-111111111111',
  p_date_iso: '2026-05-02',
});

// data example
// [
//   {
//     starts_at_iso: '2026-05-02 13:00:00+00',
//     ends_at_iso: '2026-05-02 13:30:00+00',
//     remaining_capacity: 2
//   }
// ]
```

### B) Booking exitoso
```ts
const { data, error } = await supabase.rpc('create_appointment', {
  p_business_id: '22222222-2222-2222-2222-222222222222',
  p_start_time: '2026-05-02T13:00:00-03:00',
  p_end_time: '2026-05-02T13:30:00-03:00',
  p_service_id: 'manual',
  p_customer_id: null,
  p_notes: 'Reserva test capacidad',
});

// data example
// {
//   appointment_id: '33333333-3333-3333-3333-333333333333',
//   status: 'booked',
//   capacity: 3,
//   occupied: 2,
//   remaining_capacity: 1
// }
```

### C) Rechazo por capacidad completa
```ts
const { data, error } = await supabase.rpc('create_appointment', {
  p_business_id: '22222222-2222-2222-2222-222222222222',
  p_start_time: '2026-05-02T13:00:00-03:00',
  p_end_time: '2026-05-02T13:30:00-03:00',
});

// error.message => 'CAPACITY_FULL'
```

### D) Booking cancelado ya no consume capacidad
```sql
-- 1) Cancelar booking existente
update public.bookings
set status = 'cancelled', updated_at = now()
where id = '33333333-3333-3333-3333-333333333333';

-- 2) Reconsultar disponibilidad del slot
select *
from public.query_public_slot_availability(
  'mi-salon',
  '11111111-1111-1111-1111-111111111111'::uuid,
  '2026-05-02'
)
where starts_at_iso like '2026-05-02%13:00%';

-- Esperado: remaining_capacity incrementado respecto del estado previo.
```

---

## 5) Notas de migración y compatibilidad

- El path de migración contempla instalaciones legacy con datos mínimos:
  - `businesses.capacity` se crea si falta y se normaliza a `>= 1`.
  - `bookings.start_time/end_time` se crean si faltan y se backfillean desde `starts_at/ends_at`.
  - `bookings.status` se normaliza para dejar solo `booked/cancelled`.
- Compatibilidad funcional:
  - lógica nueva usa `starts_at/ends_at` como fuente de verdad para overlap.
  - `start_time/end_time` se mantienen para tolerar consumidores legacy.
  - guard de autorización en `create_appointment` soporta esquemas heterogéneos (`owner_id`, `user_id`, fallback y `business_members` opcional).

---

## 6) Notas operativas

- **Política de rama:** esta implementación/documentación es **dev-only**.
- No mergear ni promover a `main` sin validación explícita de Santi.
- Mantener pruebas de contrato de capacidad en verde antes de cualquier promoción.
