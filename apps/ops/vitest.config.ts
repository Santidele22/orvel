import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.contract.spec.ts'],
    allowOnly: false
  }
});
