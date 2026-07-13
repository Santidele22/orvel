# One-Time Trial User Activation Reminder

This operation is at-most-once. Any invocation response, timeout, transport error, or missing response permanently forbids another invocation.

Use only `pnpm run trial-reminder:production <stage>`. This package command enters through the trusted Node launcher, sanitizes shell startup injection vectors, and starts absolute `/bin/bash --noprofile --norc` with a one-use FD capability. Direct Bash execution and ad hoc curl, SQL, secret, deploy, invocation, or cleanup commands are prohibited.

The supported Linux operator/Vercel host must provide executable `/usr/bin/env` with GNU-compatible `-S` and `-u` plus `node` on the reviewed PATH. The executable launcher's shebang removes `NODE_OPTIONS`, `NODE_PATH`, and Node IPC startup variables before Node initializes; its prerequisite probe fails closed when that contract is unavailable. Invoking the launcher as `node scripts/...` is unsupported and prohibited.

Threat-model boundary: a malicious same-account operator who deliberately fabricates file descriptors and matching process state can bypass local process conventions. That is explicitly out of scope/wont-fix; the FD contract prevents accidental/direct entry and inherited-environment injection, but is not claimed as cryptographic provenance or protection from the account owner.

## Required Inputs

- Explicit approval for deployment and the single send.
- Existing authenticated linked Supabase CLI state. The project ref is resolved from the local link; no project-ref or DB-URL environment variable is required.
- The SHA-256 of the linked ref must exactly match committed non-revealing `supabase/production-project-ref.sha256`; missing/mismatched evidence stops before CLI access and errors print neither ref nor digest.
- Deployment-only `TRIAL_REMINDER_RECIPIENT_EMAIL`, `TRIAL_REMINDER_BUSINESS_NAME`, `TRIAL_REMINDER_DASHBOARD_URL`, and `TRIAL_REMINDER_BOOKING_URL`; never commit or print values. URLs must be HTTPS and must not contain embedded credentials.

## Required Migration State

- Apply migrations in timestamp order. The original permanent guard migration remains immutable history; the only pending migrations must be `20260712190000_normalize_legacy_reminder_function_acl.sql` followed immediately by `20260712213000_generic_one_time_email_contract.sql`, with no extras, before any temporary secrets, function deployment, preflight, or invocation.
- The ACL migration removes direct EXECUTE from PUBLIC, anon, authenticated, and service_role on all four legacy functions, then grants only reserve/finalize to service_role. Its transactional postcondition checks both direct and effective access and rolls back on owner, security, membership, or ACL mismatch. Use the checked-in `trial-reminder-function-acl-diagnostic.sql` only for read-only troubleshooting; its output is role/function allowlisted and identity-free.
- The forward migration takes an exclusive table lock and accepts only zero durable rows or exactly one non-finalized `reserved` row. A pending row is rewritten to the generic lifecycle contract without changing its state or timestamps. Terminal states, multiple rows, or inconsistent finalization abort and roll back the entire migration.
- After migration, lifecycle evidence uses only `one_time_operational_email:v2` with purpose `one_time_operational_email`. Customer name, recipient, booking URL, and dashboard URL remain deployment-only secrets.
- `prepare-and-invoke` requires migrations `20260712190000` and `20260712213000` to appear exactly once, in order, with aligned local/remote history. It fails before invocation if either migration is absent or the durable row already exists.

### Bounded Forward Migration

The migration sets transactional `lock_timeout` to 5 seconds before requesting `ACCESS EXCLUSIVE`; this prevents an unbounded wait behind live reservations. It also sets transactional `statement_timeout` to 30 seconds, which bounds the complete small-table migration while leaving time for its validation and rewrite. These bounds are intrinsic SQL settings and do not depend on `PGOPTIONS` or operator shell configuration.

Run only `pnpm run trial-reminder:production forward-migrate`. Do not run the Bash script or `supabase db push` directly. The composite stage verifies linked identity and pending history, executes the exact read-only legacy schema/row gate, parses the pinned CLI dry-run and requires exactly the ACL migration followed by the generic migration with no extras, performs a bounded push without `--include-all`, verifies both versions as aligned applied history, and executes the exact post-migration gate. No independent migration stage is exposed.

On timeout or any non-zero result, stop. Do not continue to secrets, deployment, or invocation. If the push itself failed, its transaction rolls back with no partial schema or data state. Identify and allow any blocking transaction to complete through its owner; never terminate an unknown production backend. Before any retry, use read-only diagnostics to establish whether the migration remains pending. If the push may have succeeded, do not retry the composite stage until applied history and the present schema gate have been reviewed. Never run migration repair.

## Stages

1. **Review and migrate:** run checked-in `prerequisites`, then the single `forward-migrate` stage; stop on any non-zero result. The read-only `diagnose` command is troubleshooting-only and cannot push migrations. Operators must not manually compose migration or preflight commands.
2. **Normal flow:** create the approved mode-0600 secret file outside the repository with exactly four assignment lines, one for each required deployment-only input above. Comments, blank lines, exports, duplicates, and additional names are rejected before mutation. Then run `pnpm run trial-reminder:production prepare-and-invoke /secure/path`. This one stage installs cleanup traps before mutation, validates the file without logging values, sets secrets, deploys, runs all immediate gates, invokes exactly once, captures durable evidence, cleans up, and verifies absence. Delete the input file after return.
3. **Recovery only:** after SIGKILL, host loss, or interruption, run `pnpm run trial-reminder:production recover`, then `pnpm run trial-reminder:production verify-clean`. Operators must not manually compose mutation stages.

`invoke-once` is not a supported stage and is rejected by the script. Invocation is private to `prepare-and-invoke` after every gate passes. Each run first replaces mutable evidence with a fresh non-sensitive operation ID and start timestamp, so terminal fields from an older run cannot be reused.

Production roots, security checks, evidence queries, migration checks, durable-state parsers, and invocation code resolve only from checked-in repository paths. `ORVEL_ROOT` and every `TRIAL_REMINDER_*_HELPER` override are rejected; `NODE_OPTIONS`, `NODE_PATH`, and Node IPC startup variables are removed before Node starts. The reviewed Supabase CLI version is centralized in root `package.json`; `@latest` is prohibited.

Operational evidence is mutable local runtime state at `supabase/.temp/trial-reminder-production-evidence.json` (ignored, mode 0600), not a committed artifact. It contains only allowlisted statuses/counts; never copy refs, keys, email, headers, body, or provider output into it.

`record-terminal` accepts no state argument. It always queries the checked-in evidence SQL and parses the authoritative durable database state before updating local evidence.

Every cleanup/list/delete/unset CLI call is bounded by `CLI_TIMEOUT_SECONDS` (default 60). Timeout exits non-zero (`124`) and must be treated as interrupted cleanup; run checked-in `recover` until it exits zero, then run `verify-clean`.

The shell disables core dumps before any CLI operation. The Node helper independently verifies the inherited zero core limit before API-key retrieval. Every API-key record must use a unique explicitly allowed name (`anon`, `service_role`, `publishable`, or `secret`) and canonical non-empty string `api_key`; exactly one `service_role` is mandatory. Unknown, duplicate, malformed, alternate-field, or wrong-role-only results fail closed before invocation.

## Interruption Recovery

- Before invocation failure: the `prepare-and-invoke` EXIT trap cleans staged resources while the host remains alive.
- During or after invocation: never retry. Use only checked-in `recover`, retain the permanent guard, then inspect sanitized evidence.
- Cleanup is idempotent and recoverable, not guaranteed across SIGKILL, machine loss, or lost CLI/network access. From another authenticated linked host, run checked-in `recover` and `verify-clean`; escalate access recovery if they cannot run.

## Stop Conditions

- Migration/table mismatch, existing lifecycle row, unexpected dry-run migration, missing secret name, failed JWT check, deployment/list mismatch, or any command timeout/non-zero exit.
- Never treat partial output as success; every bounded command must exit zero.

Immediately before key retrieval, `prepare-and-invoke` semantically validates migration alignment, guard/zero-attempt state, one temporary function, exactly four temporary secrets, and safe-preflight 405. A small unavoidable TOCTOU boundary remains between final linked checks and invocation; the durable reservation remains authoritative.

## Local PostgreSQL Validation

Run `timeout 120s pnpm run test:supabase:trial-reminder:ci`. This wrapper provisions and removes a disposable local PostgreSQL server; PASS evidence is valid only when the wrapper itself exits zero.
