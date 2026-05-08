// ============================================
// Test Setup - Vitest Environment Polyfills
// ============================================
// Polyfills needed for Node.js test environment

// Set up environment variables BEFORE importing anything else
// This must be done before any code tries to access process.env
if (!process.env['NEXT_PUBLIC_SUPABASE_URL']) {
  process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://tzqgwziyiospmvpdgbnt.supabase.co';
}
if (!process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
  process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'sb_publishable_JH2uY3XfVHFujz_KnMdZPA_rZnHsi8i';
}

// Mock localStorage
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

// Assign to global
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true
});

// Mock window if needed
Object.defineProperty(globalThis, 'window', {
  value: globalThis,
  writable: true,
  configurable: true
});

// Mock console to avoid noise in tests (optional)
const originalConsole = globalThis.console;
globalThis.console = {
  ...originalConsole,
  warn: (...args) => {
    // Filter out known warnings if needed
    originalConsole.warn(...args);
  },
  error: (...args) => {
    // Filter out known errors if needed
    originalConsole.error(...args);
  }
};

export {};
