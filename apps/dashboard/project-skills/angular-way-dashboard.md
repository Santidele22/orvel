# Angular Way (Dashboard)

## Purpose
Provide a strict, reusable guide for building dashboard features with modern Angular (standalone components + Vitest) in a consistent, maintainable way.

## Mandatory Rules
1. **Component architecture: smart vs presentational**
   - Smart components (containers/pages) orchestrate state, routing, and use-cases.
   - Presentational components receive `@Input`/`@Output` only and stay side-effect free.
   - Keep business logic out of presentational components.

2. **Reactive typed forms only**
   - Use Angular typed forms (`FormGroup<T>`, `FormControl<T>`, `nonNullable`).
   - Build forms with explicit domain types and validators.
   - Do not use template-driven forms for dashboard features.

3. **Service layer boundaries**
   - Components must not call API clients directly.
   - Use service/facade layer for data access and orchestration.
   - Keep mock-first adapters in services; do not leak infra details into UI.

4. **Accessibility is mandatory**
   - Use semantic HTML first (`button`, `label`, `fieldset`, `nav`, etc.).
   - Ensure keyboard operability, visible focus, proper labels, and ARIA only when needed.
   - Errors and async states must be announced/accessibly exposed.

5. **Responsive by default**
   - Build mobile-first layouts and validate at common breakpoints.
   - Avoid fixed widths unless strictly justified.

6. **Test-first with Bruno (TDD expectation)**
   - Before implementation, align with Bruno on scenarios and red tests.
   - Implement only after tests define expected behavior.
   - Run unit/component tests with Vitest before PR.

7. **Git workflow (feature branch + PR)**
   - Create a branch: `feat/*`, `fix/*`, `docs/*`, `refactor/*`, or `test/*`.
   - Keep small logical commits.
   - Open PR and wait for review/approval (no direct push to main).

## Anti-Patterns
- Putting HTTP/mock storage logic inside components.
- “God components” mixing data orchestration + heavy UI rendering.
- `any`-typed forms or untyped form controls.
- Non-semantic clickable `div` elements.
- Desktop-first styling that breaks on small screens.
- Writing implementation before Bruno’s test definition.

## Checklist Before PR
- [ ] Smart vs presentational split is clear and documented in code structure.
- [ ] Forms are reactive + typed, with explicit validators and error states.
- [ ] Data access goes through services/facades (no UI-layer infra coupling).
- [ ] Accessibility checks pass (keyboard, focus, labels, semantics).
- [ ] Responsive behavior validated for mobile/tablet/desktop.
- [ ] Vitest tests exist and pass; scenarios were aligned test-first with Bruno.
- [ ] Branch/commits/PR follow the mandatory git workflow.
