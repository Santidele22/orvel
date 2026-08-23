# ADR 0010: Hexagonal Architecture (Booking Pilot)

Adopt hexagonal architecture for the Orvel dashboard. Booking is the pilot bounded context.

- **Status**: Accepted for booking pilot. WU6 leftover mixed source-locks remain; the hexagonal pilot is not complete.

## Context

Dashboard booking mixed Angular DI, Supabase RPC, signals, and domain rules in `turno.service.ts` (~1,934 lines). Source-locking specs pinned dashboard file paths instead of package ports. `@orvel/booking` already holds extracted contracts plus domain, application, and infrastructure. Dashboard still has mixed source-locks.

## Decision

Adopt hexagonal (ports and adapters) for the Orvel dashboard. Booking is the only pilot context. Other bounded contexts stay as-is until a later change.

## Layers

| Layer | Lives | Allowed | Forbidden |
|-------|-------|---------|-----------|
| Domain | `packages/booking/src/domain` | Pure TS | Angular, RxJS, Supabase, `fetch`, DOM |
| Application | `packages/booking/src/application` | Domain + port types | `@angular/(core\|common\|platform-browser)`, Supabase, `fetch` |
| Infrastructure | `packages/booking/src/infrastructure` | Ports + domain types; Angular DI for `SupabaseClient` only | Booking pages / templates |
| Interfaces | `apps/dashboard/.../features/booking` | Use cases + domain types | Inline `.rpc(` |

Package subpaths: `@orvel/booking`, `./domain`, `./application`, `./infrastructure`.

## Ports & Adapters

| Port | Role |
|------|------|
| `BookingQueries` | Cross-context reads |
| `AdminBookingRepository` | Admin mutations |
| `SupabaseBookingGateway` | Public booking transport |
| Notification port | Side effects (`NotificationEmitPort` in current source) |

Ports live in application. Adapters live in infrastructure. Callers import ports, not adapters.

## Angular Integration

Signals are reactive state, not transport. Angular DI wires `SupabaseClient` at infrastructure only (`SUPABASE_CLIENT` at root; feature providers bind adapters). Domain and application stay instantiable without TestBed.

## Consequences

- Domain and application are testable without Angular or the network.
- Other dashboard surfaces can consume booking through ports.
- The leftover `types.ts` shim is deleted; WU6 leftover mixed source-locks remain.
- Bundle delta was not measured because no production bundle bytes changed beyond the import specifier. A later runtime move would compare `apps/dashboard` production build output sizes.

## Alternatives Considered

- Big-bang hexagonal reshape of the whole dashboard — rejected; unreviewable.
- Adapters-only pilot that keeps the god service — rejected; leaves the coupling this pilot exists to break.
- Split-by-package (`packages/types` first) instead of split-by-capability — rejected; booking is the hottest, most tangled context.

## TDD Exception

Root `AGENTS.md` requires Red-Green-Refactor. The hexagonal pilot authorized deleting 18 source-locking specs and replacing them with package-layer contracts (issue #256). Replacement coverage is the mandate. Leftover mixed source-locks from WU6 remain, so WU6 is not complete and this ADR does not archive that work.

## Migration Strategy

Phased WU1–WU7. Chained PRs. Authored add+del budget 400 per slice.

1. WU1 — domain into `@orvel/booking`.
2. WU2 — infrastructure + `SUPABASE_CLIENT`.
3. WU3 — `AdminBookingRepository`.
4. WU4 — split `turno.service.ts`.
5. WU5 — `BookingQueries` + dashboard consumers.
6. WU6 — delete source-locking specs + write replacements. Leftovers remain.
7. WU7 — this ADR. Delete dashboard shims `gateway-interface.ts` and `public-booking-slug.ts`. WU7 follow-up deleted `types.ts` shim; keep `models/turno.model.ts`.

Bundle size: not measured here (docs + import specifier + shim delete). Method for a later runtime slice: compare `apps/dashboard` production build output sizes.

## References

- Issues: #240 (this work unit), #252, #253, #255, #256.
- ADR 0001, `packages/booking/README.md`, root `AGENTS.md`, `apps/dashboard/AGENTS.md`.
