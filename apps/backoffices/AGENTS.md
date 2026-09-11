# Agent Rules - Orvel operator backoffice

This subtree is the **Orvel staff operator product**, not the salon dashboard.

Start with the root `AGENTS.md` before any change here.

## Product boundary

- This app is for Orvel platform operators (internal ops).
- Salon product stays in `apps/dashboard`. Never import salon dashboard feature modules from here.
- Reuse the **same Supabase project** as the rest of Orvel. Do not invent a second backend.
- Privileged reads and writes go through **RPCs**. RPCs are the security boundary; the UI is not.
- QA host for this slice: existing Vercel site at `/ops` (for example `qa.orvel.pro/ops`). Dedicated host `ops.orvel.app` is later; do not require new DNS in this slice.
- Feature PRs target `dev`. Never open this app's PRs against `qa` or `main`.

## Architecture

Hexagonal + screaming (bounded contexts) under `src/`:

| Context | Role |
|---------|------|
| `identity` | Platform operator auth (Auth `app_metadata.role = platform_operator`). Not salon onboarding. |
| `billing` | First slice: pending Premium queue + accept. |
| `finance` | Future placeholder. MRR and finance must not land in billing or dashboard. |
| `shared` | Cross-context kernel types only. Keep tiny. |

Each live context uses `domain/` → `application/` → `infrastructure/` → `presentation/`. Domain has no framework imports. Application depends only on domain ports.

Login, queue UI, and RPCs (`is_platform_operator`, `list_pending_premium_requests`, `approve_manual_premium`) are in scope. Still never import dashboard feature modules.

## Out of scope here

- Salon PWA / dashboard shell / booking features
- MRR and other finance metrics (`src/finance/` is a placeholder)
- Copying dashboard routes or auth as salon onboarding
- Decrypting pending-signup PII blobs in the queue
- Mercado Pago, hardcoded alias/CBU, new Vercel project
