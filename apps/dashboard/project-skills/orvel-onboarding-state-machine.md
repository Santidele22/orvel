---
name: orvel-onboarding-state-machine
description: Step-gate onboarding flow with localStorage progression, guard functions, persistence, and simulation layer for the Orvel dashboard.
triggers: "onboarding, signup flow, step-gate, plan selection, account creation, business types, welcome, login, dashboard first visit, onboarding guard, onboarding storage, onboarding persistence"
---

# Orvel Onboarding State Machine

## Purpose
Define and enforce the step-gate pattern for the Orvel onboarding flow: `plan → account → business-types → welcome → login → dashboard`. Each step has progression guards, localStorage-backed state, and a persistence/simulation wiring layer.

## When to Use
- Adding or modifying onboarding steps
- Implementing step guards and progression logic
- Working with onboarding localStorage keys
- Wiring onboarding persistence to backend (account + salon creation)
- Building the landing-dashboard onboarding simulation layer
- Modifying business-type selection, template selection, or rubro selection

## Mandatory Rules

### 1. Step-Gate Pattern
The onboarding flow follows a strict sequential order:

```
plan (1) → account (2) → business-types (3) → welcome (4) → login (5) → dashboard (6)
```

Steps are defined by the `OnboardingStep` union type:
```typescript
export type OnboardingStep = 'plan' | 'account' | 'business-types' | 'welcome' | 'login' | 'dashboard';
```

The `STEP_ORDER` map assigns a numeric rank to each step. A user can only access a step if their current step rank is >= the target step rank.

### 2. Four Guard Functions + canAccessStep()
The `onboarding-flow.guard.ts` exports four Angular route guards:
- `onboardingAccountGuard` → guards the 'account' step
- `onboardingBusinessTypesGuard` → guards the 'business-types' step
- `onboardingWelcomeGuard` → guards the 'welcome' step
- `onboardingLoginGuard` → guards the 'login' step

Each guard calls `canAccessStep(storage, step)` which performs:

1. **Step order check**: Is the user's current step >= the guarded step?
2. **Account method check** (for steps ≥ business-types): Must have `manual` or `google` account method.
3. **Welcome email trigger check** (for welcome/login/dashboard): Must have welcome email triggered.
4. **Dashboard cue check** (for login/dashboard): Must have dashboard cue set.

If any check fails, the user is redirected to `/auth/signup/plan`.

```typescript
export function canAccessStep(storage: Pick<Storage, 'getItem'>, step: OnboardingStep): boolean {
  const current = getCurrentStep(storage);
  if (STEP_ORDER[current] < STEP_ORDER[step]) return false;

  const accountMethod = storage.getItem(ONBOARDING_ACCOUNT_METHOD_KEY);
  const hasValidAccountMethod = accountMethod === 'manual' || accountMethod === 'google';
  const welcomeTriggered = storage.getItem(ONBOARDING_WELCOME_EMAIL_TRIGGERED_KEY) === '1';
  const dashboardCue = storage.getItem(ONBOARDING_DASHBOARD_CUE_KEY) === '1';

  if (step === 'business-types') return hasValidAccountMethod;
  if (step === 'welcome') return welcomeTriggered;
  if (step === 'login' || step === 'dashboard') return hasValidAccountMethod && welcomeTriggered && dashboardCue;

  return true;
}
```

### 3. localStorage Progression Pattern
Each step transition MUST save state to localStorage using well-known keys:

| Key | Purpose |
|-----|---------|
| `turnea.onboarding.step.v1` | Current step position |
| `turnea.onboarding.account-method.v1` | Account creation method (`manual`/`google`) |
| `turnea.onboarding.welcome-email-triggered.v1` | Whether welcome email was sent (`1`) |
| `turnea.onboarding.dashboard-cue.v1` | Whether dashboard cue was shown (`1`) |
| `turnea.onboarding.v1` | Full onboarding state (rubros, templates, catalog) |

Use `setCurrentStep(storage, step)` to advance the user's position.
Use `getCurrentStep(storage)` to read it (defaults to `'plan'`).
Use `markWelcomeEmailTriggeredOnce(storage)` to idempotently mark the welcome email.

### 4. Onboarding Storage Layer
The `onboarding-storage.ts` provides full state persistence:

- **State shape**: `OnboardingState` containing `selectedRubros`, `selectedTemplateIds`, `preloadedCatalog`, `activeStep`, `stateVersion`, `completedAt`.
- **Sanitization**: ALL reads go through `sanitizeOnboardingState()`. Corrupted JSON returns `EMPTY_STATE`.
- **Persistence**: `persistOnboardingState(storage, state)` and `readOnboardingState(storage)`.
- **Resume checkpoint**: `persistOnboardingResumeCheckpoint()` / `readOnboardingResumeCheckpoint()` for resume-after-refresh.

```typescript
export type OnboardingResumeCheckpoint = {
  activeStep: 'rubros' | 'templates' | 'review' | 'completed';
  stateVersion: number;
  completedAt?: string;
};
```

### 5. Plan Rules Integration
- `onboarding-plan-rules.ts` connects plan entitlements to onboarding constraints.
- `applyPlanLimitToRubros()` caps selected rubros to the plan's `maxRubros`.
- `canAddLocale()` checks if the user can add another locale based on their plan's `maxLocales`.

### 6. Persistence Service Layer
`onboarding-persistence.service.ts` is the wiring to backend repositories:

- Free plans → `accountState: 'enabled'`, `nextRoute: 'dashboard_home'`.
- Paid plans → `accountState: 'pending_payment'`, `nextRoute: 'billing_subscription'`.
- Uses dependency injection pattern: `createOnboardingPersistenceService(deps)` with `accountRepository` and `salonRepository`.
- Salon names are normalized (deduplicated, trimmed) and capped to 1.

### 7. Landing-Dashboard Wiring + Simulation
`createLandingDashboardOnboardingFlowWiring(deps)` provides:
- `submitLandingOnboarding()`: Validates profile, persists via `onboardingPersistenceService`, routes to dashboard or subscription/preapproval.
- `simulateBillingOutcome()`: Test-mode billing simulation for development.
- `resumeOnboardingFromStorage()`: Rehydrates checkpoint from localStorage.
- State version validation prevents stale submissions.

## Anti-Patterns

- ❌ **Skipping guard functions** — route guards are mandatory for every onboarding step.
- ❌ **Hard-coding localStorage keys** — always use the exported constants (`ONBOARDING_STEP_KEY`, etc.).
- ❌ **Writing directly to onboarding state without sanitization** — always go through `sanitizeOnboardingState()`.
- ❌ **Allowing navigation to steps out of order** — `canAccessStep()` enforces order.
- ❌ **Mixing onboarding state with other localStorage keys** — keep everything prefixed with `turnea.onboarding.*`.
- ❌ **Forgetting to mark welcome email as triggered** — `markWelcomeEmailTriggeredOnce()` is required for progression.
- ❌ **Hard-coding plan transitions** — use `resolveTransition()` from persistence service.

## Examples

### Route Setup with Guards
```typescript
// app.routes.ts
{
  path: 'auth/signup',
  children: [
    { path: 'plan', component: SignupPlanStepPage },
    { path: 'credentials', component: SignupCredentialsPage, canActivate: [onboardingAccountGuard] },
    { path: 'business-types', component: SignupBusinessTypesPage, canActivate: [onboardingBusinessTypesGuard] },
    { path: 'welcome', component: WelcomePage, canActivate: [onboardingWelcomeGuard] },
  ]
}
```

### Advancing a Step
```typescript
import { setCurrentStep, getCurrentStep } from '../core/onboarding/onboarding-flow-state';

// After plan selection
setCurrentStep(localStorage, 'account');
const current = getCurrentStep(localStorage); // 'account'
```

### Persisting Onboarding
```typescript
import { persistOnboardingState, readOnboardingState } from '../core/onboarding/onboarding-storage';

persistOnboardingState(localStorage, {
  selectedRubros: ['peluqueria', 'barberia'],
  selectedTemplateIds: ['tpl_001'],
  preloadedCatalog: { categories: [], services: [] },
  activeStep: 'rubros',
  stateVersion: 1,
});

const state = readOnboardingState(localStorage);
```

## Checklist
- [ ] All onboarding steps have corresponding route guards
- [ ] Guard functions call `canAccessStep()` with the correct step argument
- [ ] localStorage keys use the `turnea.onboarding.*` prefix constants
- [ ] State reads are sanitized (corrupted JSON → empty state)
- [ ] `setCurrentStep()` is called after each successful step transition
- [ ] Welcome email trigger is marked with `markWelcomeEmailTriggeredOnce()`
- [ ] Plan rules (rubro caps, locale limits) are applied during onboarding
- [ ] Persistence service correctly routes free vs paid plans
- [ ] Simulation layer works in test mode for development
