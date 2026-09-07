# 01 — System architecture (C4 sketch)

> **Owner**: @santi · **State**: sketch. Repo shape and product scope are canonical in `infra/context/architecture.md` and `infra/context/product.md`. If this drawing disagrees with those files or with `origin/dev`, those win.

![Diagram](./01-monorepo-architecture.excalidraw) _(open with [excalidraw.com](https://excalidraw.com) or VS Code Excalidraw)_

[Mermaid source](./01-monorepo-architecture.mmd)

The Excalidraw/Mermaid files can lag (they started as a post-release-2.0 **target**). Do not copy their footnotes into product claims.

## What to believe from this sketch

- Personas: Cliente, Operador, Visitante. No Mercado Pago actor.
- Containers: Landing (Astro), Dashboard (Angular PWA), Supabase (Auth + Postgres + Edge Functions + Storage + Realtime), Vercel + GitHub Actions 3-env (`dev` / `qa` / `main`).
- Multi-profesional is in the product, not a future subgroup.
- `packages/shared/` is still reserved (`.gitkeep` only). Do not extract into it.
- Mercado Pago checkout is out of v1 (ADR 0009). Señas are alias/CBU.

## What not to believe if the drawing still says it

- “`dev` still has Mercado Pago webhooks.” False. There is no `mercadopago-webhook` / `sync-mp-plans` on current `dev`.
- “Public booking is in limbo.” False. Current flow is [`02-booking-public.md`](./02-booking-public.md).
- “12 Edge Functions, 8 of them 501 stubs, `confirm-email` not merged.” Count functions on `origin/dev`. Signup confirmation lives in the landing API; `process-email-outbox` is still in the tree.
- Release-2.0 schema ADRs (`0001-schema-principles` …) are **not** on `dev`. Live ADRs: `0001-orvel-monorepo-architecture-dev`, `0009-remove-mercadopago`, `0010-hexagonal-architecture`.

## Current companions

- Public booking sequence: [`02-booking-public.md`](./02-booking-public.md)
- Archived PWA offline queue: [`archive/2026-08-13-pwa-offline-walkin-queue/`](./archive/2026-08-13-pwa-offline-walkin-queue/)

## Maintenance

- Product/scope change → `infra/context/product.md` first.
- Repo-shape change → `infra/context/architecture.md` first, then this glosa.
- Only then regenerate `.mmd` / `.excalidraw` if the picture must match.
