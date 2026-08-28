# Archive Report: release-1-0-1

## Why archived

Release 1.0.1's outbox contract (`envio-email-outbox`) was invalidated by the release-2.0 target state: the `notification_email_outbox` table was dropped, the `process-email-outbox` Edge Function deleted, and `BUSINESS_EMAIL_OUTBOX_REQUIRED` relaxed. The landing-honesty specs (`landing-rubros-honestos`, `notificaciones-durables-dashboard`, `confirmacion-email-cliente`) were superseded by the post-1.0.2 product surface. This change is obsolete; no active code or docs depend on its spec surface.

## Precedent

This archive follows the convention established by commit `d554317` (`release-2-0-cleanup-pr-2-email-outbox` → `email-outbox-cleanup`): `openspec/changes/archive/YYYY-MM-DD-<name>/<full-folder>` + `archive-report.md` + promote surviving REQs to `openspec/specs/<capability>/spec.md`.

## Where it lives now

This folder is terminal; no live successor.

## What survives

No REQs were promoted from this change; the outbox-cleanup REQs that survived release-2.0 were already promoted by commit `d554317` to `openspec/specs/email-outbox-cleanup/spec.md`.

## Date

2026-08-12
