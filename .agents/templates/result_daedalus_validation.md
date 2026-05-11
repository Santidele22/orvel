# Architecture Design: Real-time Form Validations
**ID:** DESIGN-001
**Agent:** Daedalus
**Status:** PASS

## ADR-001: Real-time Validation Engine

### Context
The user signup form in `credentials.astro` requires immediate feedback for a better user experience. The current implementation relies on native HTML5 validation which doesn't support custom rules like "name and surname" or "password matching" without additional JS.

### Decision
Implement a **Decoupled Validation Engine** using Vanilla JS. 

- **Rules Layer**: An object mapping field names to validation functions (regex, length checks, comparison logic).
- **UI Layer**: Functions to toggle error states (CSS classes and text content) in the DOM.
- **Event Layer**: A single event listener on the form container using delegation or individual listeners on `input` and `blur`.

### Alternatives
1. **React/Vue Integration**: Rejected. Converting the page to a framework for one form increases complexity and bundle size.
2. **Library (Zod/Yup)**: Rejected for now. Native JS is sufficient for these rules and avoids a new dependency.

### Consequences
- **Positive**: Immediate feedback, accessible errors, and low performance overhead.
- **Negative**: Manual DOM management for errors.

## NFR Checklist
- [x] **Performance**: No debouncing needed for simple regex; typing must remain fluid.
- [x] **Accessibility**: Error messages must be associated with inputs using `aria-describedby` and use `role="alert"` or `aria-live`.
- [x] **Separation of Concerns**: Magnus will implement the `Validator` logic; Aurora/Tyrion will implement the DOM interaction.

## Quality Gate Verdict: PASS
The architecture is sound. Proceed to **BREAK DOWN** and **IMPLEMENT**.

### Recommendations for Magnus:
- Ensure the `telefono` validation handles international formats (+54...).
- The `name` validation should check for at least one space to ensure Name + Surname.

### Recommendations for Aurora:
- Use `text-error` (red) and add a small entrance animation for the error message.
- Input border should turn red when invalid.
