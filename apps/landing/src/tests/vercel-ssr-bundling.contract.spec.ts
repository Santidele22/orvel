import { describe, expect, it } from 'vitest';

import astroConfig from '../../astro.config.mjs';

describe('Contract: Vercel SSR bundling', () => {
  it('bundles Supabase client into the server function instead of externalizing it', () => {
    expect(astroConfig.vite?.ssr?.noExternal).toContain('@supabase/supabase-js');
  });

  it('bundles Zod validation into the server function instead of externalizing it', () => {
    expect(astroConfig.vite?.ssr?.noExternal).toContain('zod');
  });
});
