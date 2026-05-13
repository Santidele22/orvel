# Dashboard Project Skills

## Purpose
This folder contains **project-local skills** for the dashboard team to keep implementation consistent across Angular, Tailwind, Atomic Design, and delivery workflow.

## Skills Index

### 1) `angular-way-dashboard.md`
**Use when:**
- Building or refactoring Angular features/components.
- Creating forms, service interactions, or component boundaries.

**Focus:**
- Smart vs presentational components
- Reactive typed forms
- Service layer boundaries
- Accessibility + responsive behavior
- Test-first expectation with Bruno (Vitest)
- Git feature branch + PR workflow

---

### 2) `tailwind-atomic-design.md`
**Use when:**
- Designing or implementing UI structure and style.
- Splitting UI into reusable components.

**Focus:**
- Atomic Design hierarchy (atoms → pages)
- Tailwind conventions
- Smart vs presentational ownership by layer
- Accessibility and responsive design
- Reactive typed forms support in UI primitives
- Test-first with Bruno + git workflow

---

### 3) `dashboard-feature-workflow.md`
**Use when:**
- Starting any new feature from planning to PR.
- Coordinating cross-role execution (dev + QA + docs).

**Focus:**
- Scope and acceptance-first approach
- Mock-first implementation posture
- TDD flow with Bruno before implementation
- Delivery gates (quality, accessibility, responsive)
- Feature branch + PR process

---

### 4) `orvel-supabase-auth-wiring.md`
**Use when:**
- Implementing auth, login/signup flows, or route guards.
- Working with Supabase PKCE, session mapping, or encrypted storage.

**Focus:**
- Dual provider pattern (mock/supabase)
- PKCE flow configuration + SupabaseAuthClientAdapter
- Route guards with onboarding metadata checks
- returnTo sanitization (security)
- AES-GCM encrypted token storage

---

### 5) `orvel-onboarding-state-machine.md`
**Use when:**
- Building onboarding flows or modifying step progression.
- Adding guard functions or persistence logic.

**Focus:**
- Step-gate pattern (plan → account → business-types → welcome → login → dashboard)
- 4 guard functions + canAccessStep()
- localStorage progression with well-known keys
- Persistence service and simulation layer

---

### 6) `orvel-plan-entitlements.md`
**Use when:**
- Working with plan codes, entitlements, or billing.
- Checking plan limits or building upgrade screens.

**Focus:**
- Canonical plan codes (FREE/STARTER/GROWTH/PRO) + legacy aliases
- normalizePlanCode() and getPlanEntitlements() pure functions
- Account-level plan policy
- Server-side entitlement snapshots and assertions

---

### 7) `orvel-contract-testing-patterns.md`
**Use when:**
- Writing tests or implementing TDD workflows.
- Setting up contract specs or integration tests.

**Focus:**
- Contract-based testing with *.contract.spec.ts naming
- .red.contract.spec.ts for TDD red phase
- Dynamic await import() for graceful module detection
- Triple-A pattern (Arrange, Act, Assert)
- Mock data conventions
- Integration test structure

---

### 8) `orvel-mercadopago-subscriptions.md`
**Use when:**
- Integrating Mercado Pago recurring billing (subscriptions API).
- Handling webhooks, plan catalog, or rollout gating.

**Focus:**
- Preapproval + preapproval_plan APIs (not Checkout-Pro)
- Plan catalog resolution (tier + cadence mapping)
- Webhook signature verification + idempotency
- Rollout gating with percentage-based bucket assignment
- Subscription state machine (authorized → active/paused/canceled)
- Structured observability metrics

---

### 9) `orvel-edge-function-pattern.md`
**Use when:**
- Creating or modifying Supabase Edge Functions.
- Implementing CORS, rate limiting, or server-side logic.

**Focus:**
- Shared module imports (_shared/)
- Rate limiting with per-IP Map<string, number[]>
- CORS preflight + origin validation
- Server secret validation via requireServerSecret()
- Standard error shape { success: false, error: "ERROR_CODE" }
- Structured JSON observability

## Recommended Usage Order
1. Start with `dashboard-feature-workflow.md` (overall delivery process).
2. Apply `angular-way-dashboard.md` during Angular architecture and coding.
3. Apply `tailwind-atomic-design.md` during UI composition/styling.
4. Use domain-specific skills as needed:
   - `orvel-supabase-auth-wiring.md` for auth features
   - `orvel-onboarding-state-machine.md` for onboarding flows
   - `orvel-plan-entitlements.md` for billing/plan logic
   - `orvel-mercadopago-subscriptions.md` for payment integration
   - `orvel-edge-function-pattern.md` for edge functions
5. Use `orvel-contract-testing-patterns.md` for all test writing.
6. Run each file's **Checklist Before PR** before opening a pull request.

## Non-Negotiables (Applies to All Skills)
- Smart vs presentational boundaries must be explicit.
- Reactive typed forms are mandatory for data-entry features.
- Service layer boundaries must be respected.
- Accessibility and responsive behavior are required.
- Test-first execution with Bruno is expected.
- Git workflow is mandatory: feature branch + PR.
