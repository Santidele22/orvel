# Archive Report: release-1-0-3-pwa

## Why archived

release 1.0.3 (PWA mobile-first) closed at Fase 1+2 via PR #180 (commit `c1127a0`) merged to `main` on 2026-07-27. Fase 3 (offline IndexedDB walk-in queue) and Fase 4 (mobile verification with Playwright + Lighthouse CI) were deferred post-MVP per maintainer decision on 2026-08-13. See `openspec/changes/archive/2026-08-12-release-1-0-1/roadmap.md` for the updated release status.

## Precedent

This archive follows the convention established by commit `d554317` (`release-2-0-cleanup-pr-2-email-outbox` → `email-outbox-cleanup`): `openspec/changes/archive/YYYY-MM-DD-<name>/<full-folder>` + `archive-report.md`.

## Where it lives now

Terminal. No live successor. The Fase 3 (offline walk-in queue) and Fase 4 (mobile verification) capabilities are not in MVP scope and will be re-proposed if the team revisits offline-first booking later.

## What survives

No specs were promoted. Both specs (`pwa-offline-walkin-queue`, `pwa-mobile-verification`) were deleted from the archive folder (not promoted to `openspec/specs/`) because the capabilities are deferred post-MVP and have no committed consumer.

## Date

2026-08-13