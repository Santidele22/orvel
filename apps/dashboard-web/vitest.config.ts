import { defineConfig } from 'vitest/config';

/**
 * Fase 3 of #1098 — the web target's own suite.
 *
 * It guards the web/pwa seam from this side: which routes the web app may mount, and that no PWA
 * machinery leaks into its source or its build.
 */
export default defineConfig({
  test: {
    allowOnly: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**', '.angular/**'],
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    testTimeout: 10000,
    reporters: ['default'],
    watch: false
  }
});
