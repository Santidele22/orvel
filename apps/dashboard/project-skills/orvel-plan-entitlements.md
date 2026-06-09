---
name: orvel-plan-entitlements
description: Canonical plan codes (FREE/STARTER/GROWTH/PRO), legacy alias mapping, entitlement resolution, account-level plan policy, and server-side entitlement enforcement.
triggers: "plan, entitlement, plan code, plan entitlements, normalize plan, FREE, STARTER, GROWTH, PRO, BASIC, MEDIUM, account plan policy, server entitlement, upgrade screen, billing plan"
---

# Orvel Plan Entitlements

## Purpose
Define and enforce the canonical plan system for Orvel: normalized plan codes (FREE/STARTER/GROWTH/PRO), legacy alias mapping (BASIC/MEDIUM), entitlement resolution via pure functions, account-level plan policy, and server-side entitlement snapshots with usage-based assertion.

## When to Use
- Adding or modifying plan codes or entitlement limits
- Normalizing plan codes from external sources (Supabase, Mercado Pago, user input)
- Checking plan limits for features (max locales, max rubros, max monthly bookings)
- Building the upgrade screen (comparing current plan vs available plans)
- Implementing server-side entitlement checks
- Wiring billing plans from the landing page

## Mandatory Rules

### 1. Canonical Plan Codes
The system has exactly 4 canonical plan codes:
```typescript
export type CanonicalPlanCode = 'FREE' | 'STARTER' | 'GROWTH' | 'PRO';
```

Legacy/alias codes are mapped to canonical:
```typescript
export type LegacyPlanCode = 'STARTER' | 'BASIC' | 'MEDIUM';
```

The alias mapping is:
- `BASIC` → `STARTER`
- `MEDIUM` → `GROWTH`
- `STARTER` → `STARTER` (canonical alias for self)

### 2. normalizePlanCode() — The Universal Normalizer
The `normalizePlanCode()` function in `plan-entitlements.ts` is THE universal plan normalizer:
```typescript
export function normalizePlanCode(plan: unknown): CanonicalPlanCode {
  if (typeof plan !== 'string') return 'FREE'; // default fallback

  const normalizedPlan = plan.trim().toUpperCase();
  if ((CANONICAL_PLAN_CODES as readonly string[]).includes(normalizedPlan)) {
    return normalizedPlan as CanonicalPlanCode;
  }
  if (normalizedPlan in PLAN_CODE_ALIASES) {
    return PLAN_CODE_ALIASES[normalizedPlan as LegacyPlanCode];
  }
  return 'FREE'; // unknown → default to FREE
}
```

Rules:
- Input can be `unknown` — always handle non-string types gracefully.
- Always trim and uppercase before matching.
- Unrecognized codes default to `'FREE'`.
- **CRITICAL**: The plan DB and frontend entitlements BOTH have their own `normalizePlanCode()`. The server-side version in `entitlements.api.ts` uses a different mapping (STARTER→BASIC, GROWTH→MEDIUM). Be aware of this dual normalization.

### 3. Plan Entitlements — Pure Function
```typescript
export type PlanEntitlements = {
  maxLocales: number;
  maxRubros: number;
  maxMonthlyBookings: number | null; // null = unlimited
};

export const CANONICAL_PLAN_ENTITLEMENTS = {
  FREE:   { maxLocales: 1,  maxRubros: 1,  maxMonthlyBookings: 15 },
  STARTER: { maxLocales: 1,  maxRubros: 2,  maxMonthlyBookings: null },
  GROWTH:  { maxLocales: 3,  maxRubros: 5,  maxMonthlyBookings: null },
  PRO:    { maxLocales: 10, maxRubros: 10, maxMonthlyBookings: null },
};
```

- `getPlanEntitlements(plan: unknown): PlanEntitlements` always returns a valid entitlements object.
- Unknown plans fall back to FREE entitlements.
- The `PLAN_ENTITLEMENTS` record includes both canonical and legacy codes for convenience.

### 4. Account-Level Plan Policy (resolveTransition)
The `onboarding-persistence.service.ts` determines post-onboarding flow based on plan:
- **FREE** → `accountState: 'enabled'`, `nextRoute: 'dashboard_home'`
- **Paid plans** (STARTER/GROWTH/PRO) → `accountState: 'pending_payment'`, `nextRoute: 'billing_subscription'`

### 5. Server-Side Entitlements
`server-entitlements.api.ts` provides server-side entitlement enforcement:

- `getBusinessEntitlementsSnapshot(input)`: Returns `EntitlementSnapshot` with `planCode`, `limits`, `usage`, and `source: 'server'`.
- `assertBusinessEntitlement(input)`: Checks if a business can add more of a given metric.
  - Returns `{ allowed: true, reason: 'OK', remaining: number }` or `{ allowed: false, reason: 'ENTITLEMENT_LIMIT_EXCEEDED' | 'SUBSCRIPTION_NOT_ACTIVE', remaining: 0 }`.
- The `resolvePlanCode()` function maps businessId → plan code (currently hardcoded for QA).
- The `resolveUsage()` function maps businessId → current usage metrics.

### 6. Supabase-Backed Entitlements (Billing Module)
`entitlements.api.ts` (in billing/subscriptions/) provides Supabase-backed enforcement:

- `createSupabaseEntitlementsRepository(supabase)` → repository using `get_business_entitlements_snapshot` RPC.
- `configureEntitlementsRepository(repo)` / `getEntitlementsSnapshot(input)` → decoupled access.
- `assertEntitlement(input)` → checks metric against live Supabase data.
- Uses its own `normalizePlanCode()` with different mapping (STARTER→BASIC, GROWTH→MEDIUM).

### 7. Landing Plans Integration
`landing-plans-source.api.ts` provides a view model for the landing/pricing page:
- `fetchLandingPlans()` → `LandingPlanViewModel[]` sorted by plan order.
- Supports fallback from static `PLAN_ENTITLEMENTS` or dynamic rows via `window.__LANDING_PLAN_ENTITLEMENTS__`.
- Includes billing cadences (monthly/quarterly/annual with discounts).

### 8. Upgrade Screen Server Truth
`upgrade-screen-server-truth.ts` builds the upgrade UI view model:
- `buildUpgradeScreenViewModel(input)` → card states: `'CURRENT_PLAN'`, `'UPGRADE'`, `'DOWNGRADE_DISABLED'`.
- Uses `normalizePlanCode()` for consistent comparison.
- Current usage is displayed as `"used/limit"` strings.

## Anti-Patterns

- ❌ **Hard-coding plan strings** — always use `normalizePlanCode()` to handle aliases and casing.
- ❌ **Assuming all normalizePlanCode() implementations are identical** — the billing module uses its own mapping (STARTER→BASIC, GROWTH→MEDIUM).
- ❌ **Using `PLAN_ENTITLEMENTS[plan]` directly without normalization** — use `getPlanEntitlements(plan)` for the safe path.
- ❌ **Creating new plan codes without adding to CANONICAL_PLAN_CODES and PLAN_CODE_ALIASES**.
- ❌ **Hard-coding plan limits in components** — always derive from `getPlanEntitlements()`.
- ❌ **Passing raw Supabase plan codes (e.g., 'basic', 'starter') without normalizing**.

## Examples

### Normalize and Check Entitlements
```typescript
import { normalizePlanCode, getPlanEntitlements } from '../core/plans/plan-entitlements';

const plan = normalizePlanCode('basic'); // 'STARTER'
const entitlements = getPlanEntitlements('MEDIUM'); // GROWTH's entitlements
console.log(entitlements.maxLocales); // 3
```

### Server-Side Entitlement Assertion
```typescript
import { assertBusinessEntitlement } from '../core/entitlements/server-entitlements.api';

const decision = await assertBusinessEntitlement({
  businessId: 'biz_001',
  metric: 'maxLocales',
  requestedUnits: 2,
});

if (decision.allowed) {
  // Proceed with creating locales
}
```

### Landing Plans with Pricing
```typescript
import { fetchLandingPlans } from '../core/billing/landing-plans-source.api';

const plans = await fetchLandingPlans();
plans.forEach(plan => {
  console.log(`${plan.name}: $${plan.priceMonthlyCents} monthly, up to ${plan.maxLocales} locales`);
});
```

## Plan Code Reference

| Alias/Code | Canonical | Entitlements |
|------------|-----------|--------------|
| FREE | FREE | 1 locale, 1 rubro, 15 bookings/mo |
| BASIC | STARTER | 1 locale, 2 rubros, unlimited |
| STARTER | STARTER | 1 locale, 2 rubros, unlimited |
| MEDIUM | GROWTH | 3 locales, 5 rubros, unlimited |
| GROWTH | GROWTH | 3 locales, 5 rubros, unlimited |
| PRO | PRO | 10 locales, 10 rubros, unlimited |

## Checklist
- [ ] All plan code comparisons use `normalizePlanCode()` for consistency
- [ ] Legacy aliases (BASIC, MEDIUM) map correctly to canonical codes
- [ ] `getPlanEntitlements()` handles unknown/null/undefined inputs gracefully
- [ ] Server-side entitlements RPC (`get_business_entitlements_snapshot`) is wired through the repository pattern
- [ ] Account plan policy correctly routes free plans to dashboard, paid plans to subscription/preapproval
- [ ] Upgrade screen uses server-truth (not client-side entitlements)
- [ ] Landing plans page sources data from correct location (static fallback or Supabase RPC)
- [ ] No hard-coded plan strings in component logic
