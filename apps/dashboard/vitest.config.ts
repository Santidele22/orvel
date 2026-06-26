import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import type { UserConfig } from 'vitest/config';

export default defineConfig((configEnv) => ({
  test: {
    allowOnly: false,

    // Test environment
    environment: 'node',
    
    // Test patterns
    include: [
      'src/**/*.spec.ts'
    ],
    
    // Exclude patterns
    exclude: [
      'node_modules/**',
      'dist/**',
      '.angular/**'
    ],
    
    // TypeScript
    types: ['node'],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'coverage',
      include: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/*.spec.ts'
      ],
      exclude: [
        'node_modules/**',
        'dist/**',
        '.angular/**'
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70
      }
    },
    
    // Test timeout
    testTimeout: 10000,
    
    // Setup files
    setupFiles: ['./src/test-setup.ts'],
    
    // globals: true - for describe/it/beforeEach globals
    globals: true,
    
    // Reporters
    reporters: ['default', 'verbose'],
    
    // UI (optional - disable for CI)
    ui: false,
    
    // Watch mode
    watch: false
  },
  
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
}) as UserConfig);
