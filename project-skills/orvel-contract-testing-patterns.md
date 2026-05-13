---
name: orvel-contract-testing-patterns
description: Contract-based testing with *.contract.spec.ts, .red.contract.spec.ts TDD red phase, dynamic import for graceful module detection, Triple-A pattern, and mock data conventions.
triggers: "test, contract test, spec, .contract.spec, .red.contract.spec, TDD, red phase, vitest, test pattern, Triple-A, unit test, integration test, mock data"
---

# Orvel Contract Testing Patterns

## Purpose
Define and enforce the contract-based testing conventions for the Orvel dashboard: `*.contract.spec.ts` naming, `.red.contract.spec.ts` for TDD red phase, dynamic `await import()` for graceful module detection, Triple-A (Arrange-Act-Assert) pattern, local mock data, and integration test structure.

## When to Use
- Writing new tests for any feature
- Implementing TDD (writing red-phase tests before implementation)
- Creating contract specs for components, services, or pure functions
- Adding integration tests that span modules
- Reviewing or refactoring existing test suites
- Setting up mock data for tests

## Mandatory Rules

### 1. Contract Test Naming Convention
All test files MUST follow this naming:

| Pattern | Purpose | Location |
|---------|---------|----------|
| `*.contract.spec.ts` | Standard contract tests | `src/app/tests/unit/` or `src/app/tests/integration/` |
| `*.red.contract.spec.ts` | TDD red-phase (pre-implementation) | Same as above |
| `*.spec.ts` | Legacy/utility tests (avoid for new code) | `src/app/tests/unit/` |

Unit tests go in `src/app/tests/unit/`. Integration tests go in `src/app/tests/integration/`.

### 2. TDD Red Phase with .red.contract.spec.ts
When writing tests before implementation:
- Name the file `<feature>.red.contract.spec.ts`.
- The test throws helpful TODO-style errors when the module doesn't exist yet:
  ```typescript
  throw new Error(
    'TODO(Aurora): create src/app/pages/landing/signup-plan-step.page.ts exporting SignupPlanStepPage...'
  );
  ```
- Tag specific assertions with `@RED` in the test name for traceability:
  ```typescript
  it('KBN-004.1.1 @RED - component exports all 4 plans', async () => { ... });
  ```
- Use `describe()` blocks organized by acceptance criteria (e.g., `KBN-004.1 - UI renders all 4 plan options`).
- The red phase test should PASS once the module exists with the expected exports.

### 3. Dynamic import() for Graceful Module Detection
ALWAYS use dynamic `await import()` to load modules in contract tests:

```typescript
async function loadModule(): Promise<ModuleType> {
  let module: Record<string, unknown>;
  try {
    module = await import('../../core/my-module');
  } catch {
    throw new Error(
      'TODO(Agent): create src/app/core/my-module.ts exporting expectedFunction().'
    );
  }

  const exportedFn = module['expectedFunction'] as ModuleType['expectedFunction'];
  if (!exportedFn) {
    throw new Error(
      'Missing export expectedFunction() in src/app/core/my-module.ts'
    );
  }

  return { expectedFunction: exportedFn };
}
```

Rules:
- Catch import errors and convert them to actionable TODO messages.
- Validate that specific named exports exist after import.
- Include the full file path and expected exports in error messages.
- Use `process.cwd()` + relative paths for file existence checks when needed.

### 4. Triple-A Pattern (Arrange, Act, Assert)
Every test MUST follow Triple-A:

```typescript
it('does something specific', async () => {
  // Arrange
  const storage = createMemoryStorage();
  const { persistPlanSelection, readPlanSelection } = await loadModule();

  // Act
  persistPlanSelection(storage, 'PRO');

  // Assert
  expect(readPlanSelection(storage)).toBe('PRO');
});
```

- **Arrange**: Set up dependencies, mocks, and initial state. Use local factory functions.
- **Act**: Execute the single behavior being tested.
- **Assert**: Verify the result with specific expectations.
- **NO** mixing of multiple behaviors in one test.
- Each test should have exactly ONE logical assertion (or a group of closely related ones).

### 5. Mock Data Conventions
Mock data should be LOCAL to the spec file (not shared across test suites):

```typescript
// ✅ GOOD: Local to spec file
const MOCK_PLANS: PlanOption[] = [
  { code: 'FREE', label: 'Free', maxLocales: 1, maxRubros: 1 },
  { code: 'BASIC', label: 'Basic', maxLocales: 3, maxRubros: 3 },
];

// ✅ GOOD: Inline string literal in describe/arrange
const expectedPlanCodes = ['FREE', 'BASIC', 'MEDIUM', 'PRO'];

// ❌ BAD: Importing from a shared fixture file for simple data
// import { PLANS } from '../fixtures/plans';
```

For complex or reusable fixtures (MercoPago skeletons, full state objects), use `src/app/tests/fixtures/`:
```
src/app/tests/fixtures/payments/mercadopago-skeleton-v1.fixture.ts
```

### 6. MemoryStorage Factory
Use a local `createMemoryStorage()` function instead of mocking `localStorage`:

```typescript
function createMemoryStorage(seed?: Record<string, string>): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    getItem(key) { return map.has(key) ? map.get(key)! : null; },
    setItem(key, value) { map.set(key, value); },
    removeItem(key) { map.delete(key); },
  };
}
```

### 7. Integration Test Conventions
Integration tests in `src/app/tests/integration/`:
- Can use `fs.existsSync()` and `fs.readFileSync()` for file-level contract checks.
- Use `path.dirname(new URL(import.meta.url).pathname)` to get the test directory.
- Resolve project root with `path.resolve(TEST_DIR, '../../../../..')`.
- Use `readRequiredFile()` helper that combines `existsSync` + `readFileSync`.
- Integration tests validate FILE CONTENT patterns (not runtime behavior).
- Test contracts by checking the source code contains expected patterns.

### 8. Vitest 4.x Best Practices
- Import from `'vitest'`: `describe`, `expect`, `it`, `vi`, `beforeEach`, etc.
- Use `vi.fn()` for mock functions with explicit return values.
- Use `vi.spyOn()` for spying on existing methods.
- Async tests use `async/await` consistently (no done callbacks).
- Use `expect.objectContaining()` and `expect.arrayContaining()` for partial matching.

## Anti-Patterns

- ❌ **Naming files without `.contract.spec.ts`** — new tests MUST use contract naming.
- ❌ **Writing implementation before red-phase test exists** — TDD is red → green → refactor.
- ❌ **Catching import errors silently** — always throw actionable TODO messages.
- ❌ **Sharing mutable mock data across test files** — keep mocks local.
- ❌ **Testing multiple behaviors in one `it()` block** — one assertion per test.
- ❌ **Using `any` type for module imports** — define proper interfaces.
- ❌ **Hard-coding magic strings in assertions** — use the same constants the implementation uses.

## Examples

### Complete TDD Red Phase Test
```typescript
// src/app/tests/unit/my-feature.red.contract.spec.ts
import { describe, expect, it } from 'vitest';

type MyModule = {
  doSomething: (input: string) => number;
};

async function loadMyModule(): Promise<MyModule> {
  try {
    const mod = await import('../../core/my-feature');
    const doSomething = mod['doSomething'] as MyModule['doSomething'] | undefined;
    if (!doSomething) throw new Error('Missing export');
    return { doSomething };
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/my-feature.ts exporting doSomething(input: string): number'
    );
  }
}

describe('MyFeature - @RED contract', () => {
  it('@RED - exports doSomething function', async () => {
    const { doSomething } = await loadMyModule();
    expect(typeof doSomething).toBe('function');
  });

  it('@RED - returns correct number for known input', async () => {
    const { doSomething } = await loadMyModule();
    const result = doSomething('test');
    expect(result).toBeTypeOf('number');
  });
});
```

### Integration Contract Test
```typescript
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(TEST_DIR, '../../../../..');

function readRequiredFile(filePath: string): string {
  expect(fs.existsSync(filePath), `Missing file: ${path.relative(ROOT, filePath)}`).toBe(true);
  return fs.readFileSync(filePath, 'utf8');
}

describe('My integration contract', () => {
  it('contains expected patterns', () => {
    const source = readRequiredFile(path.join(ROOT, 'src/app/core/my-module.ts'));
    expect(source).toMatch(/expectedPattern/);
  });
});
```

## Checklist
- [ ] Test file named `*.contract.spec.ts` or `*.red.contract.spec.ts`
- [ ] TDD red phase test has actionable TODO error messages
- [ ] Dynamic `await import()` used with export validation
- [ ] Triple-A structure: Arrange, Act, Assert
- [ ] Mock data defined locally in spec file (not shared across suites)
- [ ] MemoryStorage factory used instead of localStorage mocking
- [ ] Integration tests use `readRequiredFile()` helper
- [ ] Each test has exactly one logical behavior being tested
- [ ] @RED tags present on TDD pre-implementation tests
- [ ] describe blocks organized by acceptance criteria
