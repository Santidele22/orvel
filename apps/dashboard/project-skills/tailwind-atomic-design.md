# Tailwind + Atomic Design (Dashboard)

## Purpose
Define a practical system to build consistent UI with **Atomic Design** and **Tailwind CSS** in the Angular dashboard.

## Mandatory Rules
1. **Atomic hierarchy is required**
   - **Atoms:** primitive UI elements (buttons, inputs, badges).
   - **Molecules:** small compositions (search box, form row, card header).
   - **Organisms:** complex sections (filter panel, service list block).
   - **Templates:** layout skeletons with slots/state wiring.
   - **Pages:** route-level composition and smart orchestration.

2. **Smart vs presentational ownership**
   - Atoms/molecules are presentational.
   - Organisms are mostly presentational with minimal UI state.
   - Templates/pages are smart and orchestrate use-cases.

3. **Tailwind usage rules**
   - Prefer utility classes over custom CSS.
   - Keep class sets readable; extract reusable patterns into shared components, not random utility duplication.
   - Use consistent spacing/typography scales across atoms and molecules.

4. **Service layer boundaries still apply**
   - No atom/molecule/organism should fetch data or call infra services.
   - Data flows top-down from smart components via typed inputs.

5. **Accessibility + responsive design are non-negotiable**
   - Every atomic component must support keyboard and visible focus states.
   - Respect contrast and semantic roles.
   - Use responsive utilities (`sm/md/lg/...`) with mobile-first behavior.

6. **Reactive typed forms in atomic UI**
   - Form atoms/molecules must support typed reactive forms APIs.
   - Validation states must be explicit and accessible.

7. **Test-first with Bruno + Git workflow**
   - Define component behavior/tests first with Bruno (Vitest).
   - Develop in feature branch and merge only through PR.

## Anti-Patterns
- Skipping atomic boundaries (directly building large page-only components).
- Styling only through ad-hoc custom CSS when Tailwind utilities are sufficient.
- Passing services down into presentational atomic components.
- Inconsistent spacing/font usage across similar components.
- Components that fail keyboard interaction or responsive layouts.

## Checklist Before PR
- [ ] Feature UI maps clearly to atoms/molecules/organisms/templates/pages.
- [ ] Presentational components are pure (`Input`/`Output`) and reusable.
- [ ] No service/data-fetching logic leaked into atomic presentational layers.
- [ ] Tailwind classes are consistent, readable, and mobile-first.
- [ ] Accessibility baseline validated (focus, semantics, contrast, keyboard).
- [ ] Reactive typed form compatibility verified where forms exist.
- [ ] Vitest tests were defined test-first with Bruno and are green.
- [ ] Branch + PR workflow is respected.
