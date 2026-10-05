import { defineConfig } from 'vitest/config';

/**
 * Fase 3 of #1098 — the shared core owns its own suite.
 *
 * These specs used to run inside apps/dashboard's vitest. They move with the code so the core can
 * be verified without the app, which is the point of extracting it.
 */
export default defineConfig({
  test: {
    allowOnly: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['node_modules/**'],
    setupFiles: ['./test-setup.ts'],
    globals: true,
    testTimeout: 10000,
    reporters: ['default'],
    watch: false
  }
});
