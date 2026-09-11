import { defineConfig } from 'vite';

export default defineConfig({
  base: '/ops/',
  envPrefix: ['PUBLIC_', 'VITE_'],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
