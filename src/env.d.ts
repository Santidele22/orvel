/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly PUBLIC_DASHBOARD_URL?: string;
  // Añadí aquí otras variables de entorno si las necesitás
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
