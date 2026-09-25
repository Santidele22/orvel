import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Pin the app directory as the Vite root so every command behaves the same from any cwd.
export default defineConfig({
  plugins: [vue()],
  root: new URL(".", import.meta.url).pathname,
  build: {
    outDir: "dist/ui",
  },
  server: {
    host: "127.0.0.1",
    port: 4180,
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
