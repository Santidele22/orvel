# Dashboard Feature Workflow

## Purpose
Standardize how dashboard features are delivered end-to-end with Angular best practices, Tailwind + Atomic Design, and test-first execution.

## Mandatory Workflow
1. **Scope and acceptance first**
   - Confirm user story, acceptance criteria, and UX intent.
   - Keep implementation **mock-first** until integration is explicitly requested.

2. **Design structure decision**
   - Map feature into Atomic Design levels (atoms → pages).
   - Define smart vs presentational split before coding.

3. **Testing plan first (with Bruno)**
   - Ask Bruno for test cases (happy path, edge cases, regressions) before implementation.
   - Start in red state, then implement to green (TDD).

4. **Implementation rules**
   - Use standalone Angular components.
   - Use reactive typed forms when collecting/editing data.
   - Respect service layer boundaries (UI does not own data access concerns).
   - Build responsive and accessible UI from day one.

5. **Verification and documentation**
   - Run Vitest suite and verify no regressions.
   - Update related docs/skills notes when conventions evolve.

6. **Git workflow required**
   - Create feature branch (`feat/*`, `fix/*`, `docs/*`, `refactor/*`, `test/*`).
   - Commit logically and open PR with concise summary/checklist.
   - No direct push to `main`.

## Anti-Patterns
- Implementing UI before acceptance criteria and test definition.
- Skipping Bruno and adding tests only at the end.
- Mixing page orchestration and atomic presentational concerns.
- Tight coupling between components and infrastructure details.
- Ignoring accessibility/responsive behavior until QA.

## Checklist Before PR
- [ ] Acceptance criteria are satisfied and still traceable.
- [ ] Atomic mapping + smart/presentational boundaries are clear.
- [ ] Reactive typed forms are used where applicable.
- [ ] Service-layer boundaries are preserved.
- [ ] Accessibility validated (labels, semantics, keyboard, focus).
- [ ] Responsive layout validated at key breakpoints.
- [ ] Bruno-aligned tests were written first and are passing in Vitest.
- [ ] Branch naming, commits, and PR process follow git workflow.
