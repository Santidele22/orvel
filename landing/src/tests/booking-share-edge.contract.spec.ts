import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const EDGE = new URL('../edge/booking-share.ts', import.meta.url);
const BUILD_VERCEL = new URL('../../../../scripts/build-vercel.mjs', import.meta.url);
const SITEMAP = new URL('../../public/sitemap.xml', import.meta.url);
const BOOKING_ASTRO = new URL('../pages/booking/[slug].astro', import.meta.url);
const MIDDLEWARE = new URL('../middleware.ts', import.meta.url);
const ASTRO_CONFIG = new URL('../../astro.config.mjs', import.meta.url);

describe('Contract: booking-share Edge entry source', () => {
  it('fetches the SPA shell with anon preview data and skips non-tenant rewrites', async () => {
    const source = await readFile(EDGE, 'utf8');

    expect(source).toContain('/dashboard/index.html');
    expect(source).not.toMatch(/fetch\s*\([^)]*\/booking\//);
    expect(source).toMatch(/PUBLIC_SUPABASE_URL/);
    expect(source).toMatch(/PUBLIC_SUPABASE_ANON_KEY/);
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(source).not.toContain('@supabase/supabase-js');
    expect(source).not.toContain('createClient');
    expect(source).not.toMatch(/from\(\s*['"]services['"]\s*\)/);
    expect(source).toMatch(/rest\/v1\/rpc\/resolve_business_by_slug/);
    expect(source).toMatch(/rest\/v1\/services/);
    expect(source).toMatch(/select=name/);
    expect(source).toMatch(/is_active/);
    expect(source).toMatch(/limit=3/);
    expect(source).toContain('public, s-maxage=60, stale-while-revalidate=300');
    expect(source).toMatch(/isTenantBookingSharePath/);
    expect(source).toMatch(/toBookingShareHead/);
    expect(source).toMatch(/rewriteBookingShareHead/);
  });
});

describe('Contract: booking-share Edge emit', () => {
  it('emits booking-share.func with Edge runtime so dest /booking-share resolves', async () => {
    const source = await readFile(BUILD_VERCEL, 'utf8');

    expect(source).toMatch(/booking-share\.func/);
    expect(source).toMatch(/runtime:\s*['"]edge['"]/);
    expect(source).toMatch(/entrypoint:\s*['"]index\.js['"]/);
    expect(source).not.toMatch(/\.pnpm\/esbuild/);
    expect(source).toContain('createRequire');
    expect(source).toMatch(/platform:\s*['"]neutral['"]/);
    expect(source).not.toMatch(/local-dev-proxy/);
  });
});

describe('Contract: booking-share non-goals stay forbidden', () => {
  it('forbids sitemap tenant slugs, UA allowlists, Angular SSR, and Astro booking pages', async () => {
    const [edge, sitemap, middleware, astroConfig] = await Promise.all([
      readFile(EDGE, 'utf8'),
      readFile(SITEMAP, 'utf8'),
      readFile(MIDDLEWARE, 'utf8'),
      readFile(ASTRO_CONFIG, 'utf8'),
    ]);
    const combined = `${edge}\n${middleware}\n${astroConfig}`;

    expect(sitemap).not.toMatch(/https:\/\/orvel\.pro\/booking\//);
    expect(combined).not.toMatch(/facebookexternalhit|Twitterbot|WhatsApp|user-agent/i);
    expect(combined).not.toMatch(/@angular\/ssr|renderModule|provideServerRendering/);
    expect(astroConfig).not.toMatch(/middlewareMode:\s*['"]edge['"]/);
    expect(existsSync(fileURLToPath(BOOKING_ASTRO))).toBe(false);
    expect(edge).not.toMatch(/\/api\/(booking|preview)/);
    expect(edge).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
