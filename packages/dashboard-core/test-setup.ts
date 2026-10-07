// ============================================
// Test Setup - Vitest Environment Polyfills
// ============================================
// The core specs run in `environment: 'node'`, exactly like they did inside
// apps/dashboard, so they need the same synthetic env vars and the same
// localStorage/window stand-ins. This mirrors apps/dashboard/src/test-setup.ts;
// making the core genuinely DOM-free is a registered follow-up of #1098 Fase 1.
//
// Values are synthetic placeholders: never point tests at a real project.
if (!process.env['NEXT_PUBLIC_SUPABASE_URL']) {
  process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://dashboard-tests.invalid';
}
if (!process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
  process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'test-anon-key';
}

const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => {
      const keys = Object.keys(store);
      return keys[i] || null;
    }
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true
});

Object.defineProperty(globalThis, 'window', {
  value: globalThis,
  writable: true,
  configurable: true
});

export {};
