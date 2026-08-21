# Archive Report: release-1-0-2-cleanup

## Why archived

Release 1.0.2's cleanup scope (single-theme cleanup, shared email templates, business-types promotion, config-aware core, roadmap cleanup) was superseded by the release-2.0 target state: `business_types.theme_key` and `is_promoted` handling, the shared email-template surface, and the `business_settings` knobs were all reworked or purged by release-2.0 migrations. The email-templates unification is now limited in the target — the shared-template package never landed on dev, and the post-2.0 notification surface removed the outbox path that motivated the duplication. No active code or docs reference these specs.

## Precedent

This archive follows the convention established by commit `d554317` (`release-2-0-cleanup-pr-2-email-outbox` → `email-outbox-cleanup`): `openspec/changes/archive/YYYY-MM-DD-<name>/<full-folder>` + `archive-report.md` + promote surviving REQs to `openspec/specs/<capability>/spec.md`.

## Where it lives now

This folder is terminal; no live successor.

## What survives

No REQs were promoted from this change; the cleanup work is entirely superseded by the release-2.0 target state.

## Date

2026-08-12
