# Pre-proposal: operator-lifecycle-pushes

Product clocks **confirmed** 2026-04-09 by Santi (`DEFAULTS`). Research: **unselected**.

Proposal may launch. Do not re-interview.

## Locked already

- 11 operator inbox + web push events; no operator/client engagement email; no client push.
- Mix: triggers for first public booking + second cancel; new CRON_KEY Edge Function (~15 min GitHub) for clocked events.
- Do not extend `appointment-reminders-24h`. No `pg_cron`.
- `deposit.claimed` stays inbox-only; stale seña is a distinct later event.
- Slice order: ops (1–4) → onboarding (5–8) → retention (9–11).
- Delivery: `ask-on-risk`. No `chain_strategy` or `size:exception` yet.
- Timezone: `businesses.timezone` default `America/Argentina/Buenos_Aires`.
- Click URL: pending Q8.

## Defaults offered (token `DEFAULTS`)

| # | Question | Default token | Default meaning |
|---|---|---|---|
| 1 | Briefing hour + weekend | `0830_WEEKDAYS` | Local 08:30, Mon–Fri only |
| 2 | Stale claim age | `CLAIM_15M` | 15 minutes after `deposit_claimed_at`; not the 30-min unpaid hold |
| 3 | Empty hours | `HOURS_ALL_CLOSED` | Fire #6 only if no enabled interval on any weekday (default 09–18 does **not** fire) |
| 4 | Day-N clock | `CREATED_AT` | `businesses.created_at` |
| 5 | Turnero ready (#7) | `READY_SLUG_SVC_HOURS` | slug + ≥1 active service + ≥1 enabled day with intervals |
| 6 | Double cancel | `ANY_CANCEL_ONCE` | Any `cancelled` row for same `customer_id`; notify once at 2; no cancel-actor (limitation) |
| 7 | Live + 7d gap re-arm | `LIVE_REARM` | Live = ≥1 public booking ever and public turnero not disabled; re-arm after next public booking |
| 8 | Click URL | `TURNOS_URL` | Keep `/dashboard/turnos` for all 11; booking URL may appear in body copy |
| 9 | First-turno-soon | `FIRST_REMAINING_ONCE` | Day’s first remaining `booked`/`confirmed` turno; once per local day per business |
| 10 | Public booking | `SELF_SERVICE` | `source = 'client-self-service'` (count even if later cancelled) |

## Confirmation

- Answer token: `DEFAULTS`
- All ten rows accepted as in the table above.
- No overrides.
