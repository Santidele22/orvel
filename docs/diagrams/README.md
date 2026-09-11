# Orvel — Diagramas de arquitectura

Índice de diagramas técnicos de Orvel. Cada diagrama vive como:

- `<NN>-<slug>.excalidraw` — JSON Excalidraw v2 (abrible en [excalidraw.com](https://excalidraw.com) o VS Code extension)
- `<NN>-<slug>.mmd` — fuente Mermaid para regeneración futura
- `<NN>-<slug>.md` — glosa con audiencia, qué muestra/no muestra, y links cruzados

| #   | Diagrama                                                                                                | Audiencia | Cubre                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------- |
| 01  | [System architecture (C4 sketch)](./01-monorepo-architecture.md)                                        | Todos     | Sketch only; canonical shape is `infra/context/architecture.md`. No MP checkout in v1  |
| 02  | [Public booking flow (current `dev`)](./02-booking-public.md)                                           | Todos     | Booking público end-to-end: URL → slot query → create_public_booking → email outbox → manage/cancel/reschedule |
| 03  | _pendiente_                                                                                             |           |                                                                                        |
| 05  | _pendiente_                                                                                             |           |                                                                                        |
| 06  | _pendiente_                                                                                             |           |                                                                                        |
| 07  | _pendiente_                                                                                             |           |                                                                                        |
| 08  | _pendiente_                                                                                             |           |                                                                                        |

Pendientes (opcionales; no bloquean el v1. Slot 02 es el flujo de booking actual):

- 03-auth — flujo de auth admin + público + session handoff
- 05-pwa-sw-idb-boundary — qué hace y qué NO hace el service worker
- 06-cicd-3env-promotion — pipeline CI + promoción (ver también `operational-rules.md`)
- 07-multi-profesional — detalle de modelado (el producto ya lo tiene)
- 08-schema — entity-relationship del schema actual

## Archived

- PWA offline walk-in queue (Fase 3 deferred post-MVP) → [`archive/2026-08-13-pwa-offline-walkin-queue/`](./archive/2026-08-13-pwa-offline-walkin-queue/)

## Convenciones

- **Paleta**: violet primary + dark backgrounds (extraído de `apps/dashboard/src/styles/tokens/index.css`, fuente de verdad de los tokens que `tailwind.config.js` referencia vía CSS vars)
- **Estilo**: hand-drawn (`roughness: 1`)
- **Layout**: sistema bajo diseño en el centro, personas a la izquierda, externos a la derecha
- **Versión del schema**: Excalidraw v2
- **Audiencia primaria**: equipo técnico (nuevos devs + arquitectura)
