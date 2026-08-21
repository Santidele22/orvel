# Orvel Release Roadmap

> Última actualización: 2026-07-27

## Visión pública (para landing)

> **Orvel gestiona todos los rubros de belleza — pero vamos uno por vez.**
> Empezamos por **uñas**. Cuando ese ciclo esté afinado, seguimos con el próximo vertical.
> Los demás rubros ya están pensados en la arquitectura; solo esperamos el momento correcto para activarlos.

Mensaje central para el equipo comercial y la landing:
- ✅ Sí a todos los rubros de belleza (peluquería, barbería, masajes, estética, cejas/pestañas, spa, otros).
- 🐢 Ritmo: uno por vez, validado con un profesional real antes de pasar al siguiente.
- 💅 Vertical activo ahora: **uñas** (influencer partner).

## Releases

| Release | Estado | Descripción |
|---------|--------|-------------|
| **1.0.1** | ✅ Cerrado y en prod | Landing honesta, signup, email outbox, dashboard notifications, customer cancel/reschedule, reminders 24h |
| **1.0.2** | ✅ Cerrado y en prod | Cleanup arquitectónico: tema único, shared email templates, booking config knobs, roadmap. Migraciones aplicadas a `tzqgwziyiospmvpdgbnt`. |
| **1.0.3** | 🟡 Fase 1+2 mergeada (PR #180), Fase 3+4 pendientes | **PWA mobile-first** — install, offline shell, scope limitado a operaciones diarias |
| **1.0.4** | 📋 Planeado | **Pack-uñas + activación influencer** — primer behavior pack concreto, ciclo real con partner |
| **1.0.5+** | 📋 Por definir post-uñas | Pack-masajes, pack-barbería, pack-peluquería, pack-cejas/pestañas, pack-spa, pack-otro (uno por vez) |
| **1.0.10/11** | ❓ Diferido | Multi-profesional (RPC hoy rechaza con `CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN`) |

## Cambio de estrategia (24/07 + 27/07)

**24/07**: se abandona el modelo de releases por rubro/vertical en favor de **releases transversales por capacidad**, con **behavior packs** como mecanismo de diferenciación por rubro (Path C del audit estratégico).

**27/07**: se invierte el orden original — **PWA primero, uñas después**. La razón: los usuarios gestionan desde el celu, y activar uñas sin mobile-first entrega un producto a medias. PWA es el sistema circulatorio del producto; las verticales son las hojas del árbol.

```
Antes (orden original 24/07)        Ahora (orden revisado 27/07)
─────────────────────────────       ─────────────────────────────
1.0.2 Cleanup                       1.0.2 Cleanup (cerrado en prod)
1.0.3 Pack-uñas                     1.0.3 PWA mobile-first    ← nuevo orden
1.0.4 PWA                           1.0.4 Pack-uñas + influencer
1.0.5+ Siguientes verticales        1.0.5+ Siguientes verticales
```

## Decisión mobile (27/07)

**NO existe script** que migre Angular/Astro + Supabase a mobile nativo. Cualquiera que prometa eso miente o vende Capacitor (webapp envuelta, no nativa).

Decisión: **PWA mobile-first con scope limitado** primero; mobile nativo (RN/Flutter) solo si PWA valida tracción y aparecen limitaciones concretas.

**Scope mobile (1.0.3)**:
- Ver agenda del día
- Agregar turno manual / walk-in
- Ver notificaciones
- Llamar al cliente
- Marcar "no vino"

**Scope desktop-only** (no entra en PWA):
- Configurar servicios y horarios
- Branding
- Integración Mercado Pago
- Reportes
- Configuración de buffers y defaults

### PWA decisions cerradas (PR #180)

- Approach: `@angular/pwa` + Web Push deferred + IndexedDB offline queue
- Bottom nav bar (5 items: Inicio / Turnos / Clientes / Notificaciones / Perfil)
- start_url = `/dashboard/turnos` (agenda directo)
- NO push notifications en MVP (release siguiente con Web Push API + VAPID)
- Tailwind migrado de CDN a build local (obligatorio para offline real)
- iOS Background Sync no soportado → walk-in offline necesita botón "Enviar ahora" manual

## Próximos pasos inmediatos

1. **PWA Fase 3** (cola offline IndexedDB para walk-in + UI cola + botón manual iOS) — branch nueva sobre `c1127a0`.
2. **PWA Fase 4** (Playwright mobile devices + Lighthouse CI + contract tests PWA adicionales).
3. **Actualizar landing con nueva visión** (mensaje "todos los rubros, uno por vez, empezando por uñas"). Cambio de copy en Hero, Features y HowItWorks.
4. **Pack-uñas** (1.0.4): scaffold del sistema de behavior packs + pack concreto para uñas (durations variables: manicura 30, gel 90, acrílicas 90; copy per-rubro; defaults `business_settings`).
5. **Activar ciclo con influencer uñas**: ciclo completo de turno sin asistencia.

## Backlog abierto

- **Mercado Pago subscriptions** — estabilización pendiente (3 bloques: webhook lifecycle, idempotencia, cambio de plan/reconciliación). Bloqueado por autorización explícita de Santi para deploy.
- **Walk-ins público con cola virtual** (issue #162, BAR-SOLO-P0-05) — P0 bloqueante para barbería. Deferido post-1.0.10.
- **Observabilidad post-1.0.1** — cerrar `.funemon/plans/current.norg` (Slices 4-5: monitoring + runbooks + capacity testing).
- **Verificación con operador real por release** — disciplina Santi: cada release chica espera feedback del profesional real antes de la próxima.

## Referencias

- [ADR-014: Diferenciación por config, no por código](../../docs/adr/adr-014.md)
- [Audit estratégico 24/07](#) (Path C: híbrido core + behavior packs)
- [Propuesta 1.0.2](../release-1-0-2-cleanup/proposal.md)
- [Tasks 1.0.2](../release-1-0-2-cleanup/tasks.md)
- [Propuesta 1.0.3 PWA](../release-1-0-3-pwa/proposal.md) _(see deferred note below)_
- [Tasks 1.0.3 PWA](../release-1-0-3-pwa/tasks.md) _(see deferred note below)_

> **Forward refs (legacy)** — the lines above referenced `release-1-0-3-pwa/{proposal,tasks}.md`. Per maintainer decision 2026-08-13, Fase 3 (offline IndexedDB queue) and Fase 4 (mobile verification) were deferred post-MVP. The corresponding change folder was archived at `openspec/changes/archive/2026-08-13-release-1-0-3-pwa/` on the same date. The forward refs above are intentionally kept as historical record; the live tree no longer carries the targeted files.
>
> [historical] Original forward refs (kept for traceability):
>
> > - [Propuesta 1.0.3 PWA](../release-1-0-3-pwa/proposal.md)
> > - [Tasks 1.0.3 PWA](../release-1-0-3-pwa/tasks.md)

- [Plan MP subscriptions](../../plans/stabilize-mercadopago-subscriptions.norg)
