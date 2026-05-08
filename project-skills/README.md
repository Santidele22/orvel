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

## Recommended Usage Order
1. Start with `dashboard-feature-workflow.md`.
2. Apply `angular-way-dashboard.md` during architecture and coding.
3. Apply `tailwind-atomic-design.md` during UI composition/styling.
4. Run each file’s **Checklist Before PR** before opening a pull request.

## Non-Negotiables (Applies to All Skills)
- Smart vs presentational boundaries must be explicit.
- Reactive typed forms are mandatory for data-entry features.
- Service layer boundaries must be respected.
- Accessibility and responsive behavior are required.
- Test-first execution with Bruno is expected.
- Git workflow is mandatory: feature branch + PR.
