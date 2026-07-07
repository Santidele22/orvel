import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    allowOnly: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    watch: false
  }
});
