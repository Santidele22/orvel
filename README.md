# Orvel

> Sistema de gestión de turnos para salones de belleza — multi-tenant SaaS con foco mobile-first.

[![CI](https://github.com/Santidele22/orvel/actions/workflows/booking-regression.yml/badge.svg)](https://github.com/Santidele22/orvel/actions/workflows/booking-regression.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## ¿Qué es Orvel?

Orvel es un SaaS B2B para salones de belleza (uñas, barbería, peluquería, masajes, estética) que reemplaza la gestión manual de turnos (papel, Excel, WhatsApp) por un sistema digital pensado para celular. Las dueñas y recepcionistas reservan, modifican y dan seguimiento desde el teléfono; los clientes finales reservan solos desde una página pública.

## Features

- **Agenda mobile-first**: day strip con scroll horizontal, cards de turnos con estado y duración, FAB para walk-ins.
- **Reservas públicas**: cada salón tiene una landing donde sus clientes reservan sin necesidad de login.
- **Walk-in**: crear turnos en el momento para clientes sin reserva previa.
- **Multi-profesional** (roadmap): soporte para equipos con varios profesionales, horarios individuales y asignación de turnos.
- **Notificaciones en tiempo real**: las dueñas ven nuevas reservas al instante vía Supabase Realtime.
- **Facturación Mercado Pago** (suscripción recurrente).
- **PWA instalable**: la app puede instalarse en el celular del dueño como aplicación nativa.

## Stack

| Capa | Tecnología |
|------|------------|
| Dashboard (Angular) | Angular 21 (standalone, esbuild) + Tailwind 3 |
| Landing (Astro) | Astro 6 + Svelte 5 + Tailwind 4 |
| Backend (BaaS) | Supabase (Postgres + Auth + Storage + Realtime + Edge Functions) |
| Edge Functions | Deno |
| Tests unit/integration | Vitest 4 (Angular + Deno para Supabase) |
| E2E | Playwright (chromium) |
| Hosting dashboard + landing | Vercel |
| Package manager | pnpm (root + landing) / Bun (dashboard) |

## Arquitectura del monorepo

```
orvel/
├── apps/
│   ├── dashboard/         # Angular 21 — app para dueñas/recepcionistas (PWA mobile-first)
│   └── landing/           # Astro 6 — landing + página pública de reservas
├── supabase/
│   ├── migrations/        # SQL migrations versionadas
│   ├── functions/         # Edge Functions (Deno)
│   ├── seed-data.sql      # Datos de prueba para desarrollo
│   └── config.toml        # Config local de Supabase
├── infra/
│   └── context/           # Documentación operativa (deployment, environments, arquitectura)
├── openspec/              # Cambios arquitectónicos formalizados (proposal/spec/design/tasks)
├── docs/
│   ├── adr/               # Architectural Decision Records
│   └── runbooks/          # Guías operativas
├── .atl/                  # Skill registry (local)
└── .github/
    └── workflows/         # CI/CD pipelines
```

### Por qué monorepo

- Shared migrations + Edge Functions entre dashboard y landing (ambos consumen Supabase).
- CI unificado (un solo `pnpm` workspace en root para validación rápida).
- Mismas dependencias de tooling (Deno para Supabase, pnpm para landing, Bun para dashboard).

## Getting started (local)

### Requisitos

- Node.js 24.x
- pnpm 11.x (`corepack enable`)
- Bun 1.3+ (`curl -fsSL https://bun.sh/install | bash`)
- Deno 2.x (`curl -fsSL https://deno.land/install.sh | sh`)
- Supabase CLI (`npx supabase --version`)
- Docker (para Supabase local)

### Setup

```bash
# 1. Clonar
git clone https://github.com/Santidele22/orvel.git
cd orvel

# 2. Instalar deps del root (solo orquesta)
pnpm install

# 3. Instalar deps del dashboard (Bun)
cd apps/dashboard && bun install && cd ../..

# 4. Instalar deps del landing (pnpm)
cd apps/landing && pnpm install && cd ../..

# 5. Levantar Supabase local
supabase start

# 6. Aplicar migrations + seed
supabase db reset
```

### Dev servers

```bash
# Dashboard (Angular + Vite dev server)
cd apps/dashboard && bun run start
# → http://localhost:4200

# Landing (Astro)
cd apps/landing && pnpm run dev
# → http://localhost:4321

# Supabase Studio (después de `supabase start`)
# → http://localhost:54323
```

### Tests

```bash
# Dashboard (Vitest)
cd apps/dashboard && bun run test

# Supabase functions (Deno)
cd supabase/functions && deno test --allow-read --config deno.json
```

## Deployment

- **Frontend**: Vercel, deploy automático vía GitHub Actions cuando hay push a `qa` o `main` (ver `.github/workflows/deploy-promotion.yml`).
- **Backend**: Supabase, 2 proyectos separados:
  - `orvel-qa-dev` — ambiente compartido de desarrollo + QA
  - `orvel-prod` — producción
- **Local dev**: SQLite via Drizzle/Kysely (sin red, instantáneo).

Más detalles en `infra/context/deployment.md` y `infra/context/environments.md`.

## Contribuir

1. Fork y crear branch desde `dev` (`feat/mi-cambio`)
2. Strict TDD: spec RED → impl GREEN → refactor. Ver `project-skills/orvel-contract-testing-patterns.md`
3. Commits con [conventional commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`).
4. PR contra `dev` (no contra `main` directo).
5. CI debe pasar (`booking-regression` workflow).
6. Branch protection requiere 1 approving review + linear history.

### Convenciones

- **Lenguaje de UI**: español argentino (voseo). Mensajes directos, sin marketing speak.
- **Código**: inglés (variables, funciones, comentarios técnicos).
- **Commits y PR descriptions**: español.
- **No**: nunca commitear `.env`, secrets, `.funemon/`, ni `.opencode/`.

## Estructura de governance

- `AGENTS.md` — reglas generales del repo (leer primero).
- `infra/context/` — contexto operativo verificado.
- `openspec/changes/` — propuestas formales de cambios arquitectónicos.
- `docs/adr/` — decisiones técnicas tomadas (con contexto y trade-offs).

## Licencia

[MIT](LICENSE) — ver `LICENSE` file.

## Contacto

- Issues: [GitHub Issues](https://github.com/Santidele22/orvel/issues)
- Repo: [github.com/Santidele22/orvel](https://github.com/Santidele22/orvel)