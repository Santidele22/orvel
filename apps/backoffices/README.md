# Orvel operator backoffice

Internal app for **Orvel staff** (platform ops). It is not the salon product.

Salon owners and the booking PWA stay in `apps/dashboard`. This package is a Vite SPA served at `/ops` on the existing Vercel host.

Later dedicated host: `ops.orvel.app` (not required for this slice).

## Hexagonal map

```
src/
  identity/       platform operator auth (app_metadata.role)
  billing/        Premium request queue (first slice)
  finance/        future finance bounded context (placeholder)
  shared/         tiny cross-context kernel types
```

Each live context:

- `domain/` — entities, value objects, ports. No framework imports.
- `application/` — use cases. Depends only on domain ports.
- `infrastructure/` — Supabase browser client and RPC adapters.
- `presentation/` — Vite UI adapters.

Same Supabase project as the rest of Orvel. RPCs are the security boundary.

## First slice vs later

- **Now (billing, GitHub #619):** pending Premium queue with five fields only — who, what they asked, status, when, whether an account already exists — plus accept.
- **Later (finance):** MRR and other finance views live in `src/finance/`, not inside billing and not inside the salon dashboard.

## Auth

Only Auth `app_metadata.role = platform_operator` can open the queue. Salon JWTs see a generic not-found page.

## Out of scope

- Salon PWA, dashboard shell, booking, or salon onboarding
- MRR / finance metrics in this billing slice
- Decrypting pending-signup ciphertext
- Mercado Pago or hardcoded transfer alias
