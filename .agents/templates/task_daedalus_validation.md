## Task: Architecture Review for Real-time Form Validations
**ID:** TASK-001
**From:** Tyrion
**To:** Daedalus
**Timestamp:** 2026-05-11

### Description
Review the proposed architecture for implementing real-time validations in the user signup form (`src/pages/auth/signup/credentials.astro`).

### Context
The current form uses native HTML5 validation and a single error block. We want to move to per-field real-time feedback using Vanilla JS to maintain consistency with the existing Astro script.

### Proposed Approach
- **DOM**: Add `<p class="error-msg hidden">` elements after each input.
- **Logic**: A central `validators` object containing regex and logic for each field name.
- **Events**: Listen to `input` and `blur` on the form or individual inputs.
- **State**: Update a `formState.errors` object and toggle UI classes.

### Success Criteria
- ADR produced covering the choice of Vanilla JS vs adding a library.
- NFR Checklist (performance and accessibility focus).
- Quality Gate Verdict (pass/fail).
- Guidance on how to make this reusable for other Astro pages.

### Resources
- File: `/home/santid/santi/orvel-landing/src/pages/auth/signup/credentials.astro`
