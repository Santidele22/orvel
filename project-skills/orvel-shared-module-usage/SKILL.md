---
name: orvel-shared-module-usage
description: Guidelines for the `_shared/` directory in orvel-functions — dependency graph, when to add vs keep local, test conventions, and template modules.
triggers: adding new shared code, deciding where to place a utility, modifying _shared modules, creating tests for shared code
---

# Orvel Shared Module Usage

## When to Use

- Deciding whether to put code in `_shared/` or keep it in a function
- Adding new utility code used by multiple functions
- Writing tests for shared modules
- Understanding the dependency graph before modifying shared code

## Directory Structure

```
supabase/functions/_shared/
├── billing-security.ts              # CORS, origin validation, secrets, webhook signature
├── mercadopago-plan-variants.ts     # Plan variant builder for monthly/quarterly/annual
├── mp-plan-catalog.ts              # Plan catalog resolution (tier + cadence → preapproval_plan_id)
├── mp-rollout-control.ts           # Rollout gating evaluation
├── mp-rollout-control.test.ts      # Tests for rollout control
├── mp-rollout-observability.ts     # Structured metric logging
├── mp-subscription-guards.ts       # Status mapping, plan mapping validation
├── mp-subscription-guards.test.ts  # Tests for subscription guards
└── templates/
    ├── appointment-templates.ts    # Appointment email template rendering
    └── business-templates.ts       # Business email template rendering
```

## Dependency Graph

```
billing-security.ts
  ← Used by: create-subscription, cancel-subscription, change-subscription,
             subscription-expiry-check, sync-mp-plans, billing-reconciliation,
             mercadopago-webhook

mp-plan-catalog.ts
  ← Used by: create-subscription, change-subscription, sync-mp-plans

mp-rollout-control.ts
  ← Used by: create-subscription (and potentially other billing functions)

mp-rollout-observability.ts
  ← Used by: create-subscription, mercadopago-webhook

mp-subscription-guards.ts
  ← Used by: create-subscription, mercadopago-webhook

mercadopago-plan-variants.ts
  ← Used by: sync-mp-plans

templates/appointment-templates.ts
  ← Used by: process-email-outbox

templates/business-templates.ts
  ← Used by: process-email-outbox
```

### Key Observations

- **`billing-security.ts` is the most depended-on module** — used by all billing functions plus the webhook
- **`mp-rollout-observability.ts`** is used by both create-subscription and mercadopago-webhook — the metric patterns differ but live in one file
- **`mp-subscription-guards.ts`** contains domain logic shared between creation and webhook processing

## When to Add to `_shared/` vs Keep in Function

### Add to `_shared/` when:

1. **Used by 2+ functions** — e.g., `billing-security.ts` is in every billing function
2. **Contains domain constants** — e.g., `mp-plan-catalog.ts` has tier/cadence normalization
3. **Contains business rules** — e.g., `mp-subscription-guards.ts` has status mapping rules
4. **Has security implications** — e.g., `billing-security.ts` has signature verification
5. **Contains template rendering** — e.g., `templates/appointment-templates.ts`

### Keep in function when:

1. **Used only by that single function** — e.g., `sanitizeMercadoPagoError()` in create-subscription
2. **Tightly coupled to the function's request/response shape** — e.g., `SubscriptionRequest` type
3. **Rate limiting state** — `rateLimitStore` Map is per-function (in-memory)
4. **Function-specific helpers** like `createOpaqueCheckoutToken()`, `sha256Text()`, `normalizePlanCode()`

### Decision Flow

```
Is this code used by 2+ functions?
  ├── Yes → Add to _shared/
  │
  └── No → Is it a domain constant or business rule?
       ├── Yes → Consider _shared/ (future-proof)
       └── No → Keep in function
```

## Test Conventions

Test files are co-located in `_shared/` with `.test.ts` suffix:

```
_shared/mp-rollout-control.ts
_shared/mp-rollout-control.test.ts      ← Tests for rollout control

_shared/mp-subscription-guards.ts
_shared/mp-subscription-guards.test.ts  ← Tests for subscription guards
```

### Test Pattern

Tests use Deno's built-in test runner with `std/assert`:

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { evaluatePreapprovalPlanRollout } from "./mp-rollout-control.ts";

Deno.test("description of test case", () => {
  // Arrange
  Deno.env.set("MP_PREAPPROVAL_PLAN_ROLLOUT_PERCENT", "10");

  // Act
  const decision = evaluatePreapprovalPlanRollout({...});

  // Assert
  assertEquals(decision.allowed, true);
});
```

### Test Coverage Expectations

| Module | What's tested |
|--------|---------------|
| `mp-rollout-control.ts` | Fail-closed behavior, valid percentage acceptance, non-production bypass |
| `mp-subscription-guards.ts` | Plan mapping (free/paid/invalid), status mapping, HTTP status codes |

## Template Modules

Located in `_shared/templates/`, these are email rendering modules used by `process-email-outbox`.

### Template Pattern

```typescript
// Each template module exports:
export interface EmailPayload {
  subject: string;
  html: string;
}

// And rendering functions per email type:
export function renderAppointmentConfirmationEmail(data: AppointmentTemplateData): EmailPayload;
export function renderAppointmentReminder24hEmail(data: AppointmentTemplateData): EmailPayload;
// ... etc
```

### Template Keys (used in notification_email_outbox)

| template_key | Rendering Function | Module |
|-------------|-------------------|--------|
| `appointment_confirmation` / `booking_created` | `renderAppointmentConfirmationEmail` | appointment-templates |
| `appointment_reminder_24h` | `renderAppointmentReminder24hEmail` | appointment-templates |
| `appointment_cancelled` / `booking_cancelled` | `renderAppointmentCancellationEmail` | appointment-templates |
| `appointment_rescheduled` / `booking_rescheduled` | `renderAppointmentRescheduleEmail` | appointment-templates |
| `*_business` | `renderAppointmentBusinessNotificationEmail` | appointment-templates |
| `business_welcome` | `renderBusinessWelcomeEmail` | business-templates |

## Anti-patterns

- ❌ Duplicating the same utility code across multiple functions — move to `_shared/`
- ❌ Adding function-specific rate limiting state to `_shared/` — keep per-function in-memory
- ❌ Putting test files outside `_shared/` — co-locate with the module
- ❌ Circular dependencies between `_shared/` modules — keep dependency graph acyclic
- ❌ Importing from `_shared/` in non-function code (migrations, seed data)
- ❌ Making `_shared/` modules depend on function-specific request types or `Deno.env.get()` without going through `requireServerSecret`

## Checklist

- [ ] Code used by 2+ functions is in `_shared/`
- [ ] Rate limiting state is per-function, not shared
- [ ] Test file exists for each shared module with `.test.ts` suffix
- [ ] Test imports use `./module.ts` (relative path)
- [ ] No circular dependencies exist between shared modules
- [ ] Security-sensitive code (CORS, signature verification) is in `_shared/`
- [ ] Template modules follow the `EmailPayload` interface pattern
- [ ] New shared module is documented in this SKILL.md's dependency graph
