# TSK-MINI-CAL-API-TDD-005 — Supabase API RED Contract Handoff (Bruno ➜ Magnus)

## Scope alignment (already enforced in RED tests)
- Landing is **marketing/auth only**.
- Booking public/manage/admin flows live on **app-side dashboard routes**.
- Supabase is the source of truth (**DB + RPC + Edge**).

## Route model (approved)
- Public booking entry: `/booking/{business_slug}`
- Manage by token: `/booking/manage?token=...`

## Test file
- `src/app/tests/integration/supabase-api-layer-red.contract.spec.ts`

The RED test expects an app-side adapter module at:
- `src/app/core/api/supabase-booking.api.ts`

Required exports:
- `resolveBusinessBySlug`
- `createPublicBooking`
- `manageBookingByToken`
- `createAdminManualBooking`
- `createAdminBlockedTime`

---

## Expected endpoint contracts (response shapes)

### 1) Resolve business by slug
Input:
```ts
{ businessSlug: string }
```

Success `200`:
```ts
{
  status: 200,
  data: {
    id: string,
    slug: string,
    displayName: string,
    timezone: string,
    bookingPolicy: {
      autoConfirm: true,
      cancellationWindowMinutes: 60,
      allowClientProfessionalSelection: false
    }
  }
}
```

Not found `404`:
```ts
{
  status: 404,
  error: {
    code: 'BUSINESS_NOT_FOUND',
    message: string
  }
}
```

### 2) Create public booking (client flow)
Input:
```ts
{
  businessSlug: string,
  serviceId: string,
  startsAtIso: string,
  client: {
    fullName: string,
    email: string,
    phone?: string
  },
  notes?: string,
  professionalId?: string // forbidden by policy in client flow
}
```

Validation error `422`:
```ts
{
  status: 422,
  error: {
    code: 'VALIDATION_ERROR',
    message: string,
    details: {
      fields: string[]
    }
  }
}
```

Client professional selection forbidden `422`:
```ts
{
  status: 422,
  error: {
    code: 'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN',
    message: string
  }
}
```

Success `201` (auto-confirm MVP):
```ts
{
  status: 201,
  data: {
    bookingId: string,
    status: 'confirmed',
    source: 'client-self-service'
  }
}
```

### 3) Manage booking by token (`/booking/manage?token=...`)
Input:
```ts
{ token: string, nowIso: string }
```

Invalid token `401`:
```ts
{
  status: 401,
  error: { code: 'INVALID_TOKEN', message: string }
}
```

Expired token `410`:
```ts
{
  status: 410,
  error: { code: 'TOKEN_EXPIRED', message: string }
}
```

Policy window closed (`<1h`) `403`:
```ts
{
  status: 403,
  error: { code: 'POLICY_WINDOW_CLOSED', message: string }
}
```

### 4) Admin manual booking (dashboard flow)
Input:
```ts
{
  businessId: string,
  serviceId: string,
  startsAtIso: string,
  durationMinutes: number,
  clientId?: string,
  walkInName?: string,
  professionalId: string,
  performedBy: string,
  notes?: string
}
```

Success `201`:
```ts
{
  status: 201,
  data: {
    bookingId: string,
    type: 'manual-admin-appointment',
    status: 'confirmed',
    source: 'admin-manual'
  }
}
```

Overlap `409`:
```ts
{
  status: 409,
  error: { code: 'SLOT_CONFLICT', message: string }
}
```

### 5) Admin blocked-time endpoint (dashboard flow)
Input:
```ts
{
  businessId: string,
  startsAtIso: string,
  endsAtIso: string,
  reason: string,
  performedBy: string
}
```

Success `201`:
```ts
{
  status: 201,
  data: {
    blockId: string,
    type: 'blocked-time'
  }
}
```

Collision `409`:
```ts
{
  status: 409,
  error: { code: 'BLOCKED_TIME_COLLISION', message: string }
}
```

---

## Business rules enforced by RED
- 1h cancel/reschedule window (`POLICY_WINDOW_CLOSED` when `< 1h`).
- Auto-confirm on public booking creation (MVP).
- Deterministic token error codes: `INVALID_TOKEN`, `TOKEN_EXPIRED`, `POLICY_WINDOW_CLOSED`.
- No client-side professional selection.

## Suggested implementation notes (non-binding)
- Keep adapter function signatures exactly as in tests to unlock GREEN quickly.
- Internally map Supabase errors to deterministic API `error.code` values above.
- Use DB/RPC/Edge layer for source-of-truth behavior; app adapter should shape responses only.
