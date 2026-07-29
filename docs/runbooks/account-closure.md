# Account Closure Consumer Runbook

## Purpose

`account-closure` closes accounts whose account-cancellation request has reached the paid-through date.

## Local repository configuration

- `supabase/config.toml` declares `[functions.account-closure]` with `verify_jwt = false` because the function uses its own privileged secret gate.
- The handler requires `ACCOUNT_CLOSURE_CRON_SECRET` via either:
  - `Authorization: Bearer <secret>`
  - `x-cron-key: <secret>`

## Production scheduling contract

`.github/workflows/account-closure.yml` is the checked-in scheduler contract. It invokes the deployed Edge Function hourly and can also be run manually with `workflow_dispatch`.

Required GitHub repository secrets:

- `ACCOUNT_CLOSURE_FUNCTION_URL`: full deployed Edge Function URL for `account-closure`.
- `ACCOUNT_CLOSURE_CRON_SECRET`: privileged scheduler secret expected by the function.

Do not deploy or create the secret from this repository task unless Santi explicitly approves it. After deployment, verify that the scheduler calls the function and that unauthorized requests return `401` without processing.

Critical account-closure and account-cancellation backend tests are wired into PR CI via `.github/workflows/ci.yml` and the root `test:supabase:functions:critical` script.

## Safety checks

The consumer must only delete the requester bound in durable cancellation evidence:

- `account.cancellation_scheduled` must include `raw_payload.requested_by`.
- Provider-backed Mercado Pago subscriptions must also have `account.cancellation_provider_cancelled` with the same `raw_payload.requested_by`.
- `account.cancellation_closure_started` is the deterministic pre-delete marker and retry deletion target.

Legacy events without requester evidence must fail safely and audit `account.cancellation_closure_failed`.
