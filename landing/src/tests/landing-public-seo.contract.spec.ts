import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const LAYOUT = new URL('../layouts/Layout.astro', import.meta.url);
const DASHBOARD_INDEX = new URL('../../../../apps/dashboard/src/index.html', import.meta.url);
const ROBOTS = new URL('../../public/robots.txt', import.meta.url);
const SITEMAP = new URL('../../public/sitemap.xml', import.meta.url);
const OG_SHARE = new URL('../../public/og-share.png', import.meta.url);

function countH1(source: string) {
  return (source.match(/<h1\b/g) ?? []).length;
}

async function composedPage(pageUrl: URL) {
  const page = await readFile(pageUrl, 'utf8');
  const imports = [...page.matchAll(/from ['"](\.\.\/components\/organisms\/[^'"]+)['"]/g)].map(
    (match) => match[1],
  );
  const parts = await Promise.all(imports.map((relative) => readFile(new URL(relative, pageUrl), 'utf8')));
  return `${page}\n${parts.join('\n')}`;
}

describe('Contract: landing public SEO', () => {
  it('builds production canonical URLs from pathname with query stripped and trailing slash only on /', async () => {
    const { MARKETING_ORIGIN, marketingCanonicalUrl } = await import('../lib/public-origin');

    expect(MARKETING_ORIGIN).toBe('https://orvel.pro');
    expect(marketingCanonicalUrl('/')).toBe('https://orvel.pro/');
    expect(marketingCanonicalUrl('/plan')).toBe('https://orvel.pro/plan');
    expect(marketingCanonicalUrl('/plan?ref=home')).toBe('https://orvel.pro/plan');
    expect(marketingCanonicalUrl('/terminos-y-condiciones/')).toBe('https://orvel.pro/terminos-y-condiciones');
  });

  it('locks Layout source to per-path production canonicals, es-AR locale, robots prop, and og-share.png', async () => {
    const source = await readFile(LAYOUT, 'utf8');

    expect(source).toMatch(/lang=["']es-AR["']/);
    expect(source).toMatch(/og:locale["']?\s+content=["']es_AR["']/);
    expect(source).toMatch(/robots\s*=\s*["']index, follow["']/);
    expect(source).toMatch(/marketingCanonicalUrl\(\s*Astro\.url\.pathname/);
    expect(source).not.toMatch(/<link rel=["']canonical["'] href=["']https:\/\/orvel\.pro\/["']\s*\/>/);
    expect(source).not.toMatch(/property=["']og:url["']\s+content=["']https:\/\/orvel\.pro\/["']/);
    expect(source).toContain('https://orvel.pro/og-share.png');
    expect(source).toMatch(/og:image:width["']?\s+content=["']1200["']/);
    expect(source).toMatch(/og:image:height["']?\s+content=["']630["']/);
    expect(source).not.toMatch(/property=["']og:image["'][^>]*logo\.png/);
    expect(source).not.toMatch(/name=["']twitter:image["'][^>]*logo\.png/);
    expect(source).not.toMatch(/twitter:image["']\s+content=["']https:\/\/orvel\.pro\/logo\.png["']/);
  });

  it('keeps dashboard shell lang=es and static title Orvel', async () => {
    const source = await readFile(DASHBOARD_INDEX, 'utf8');

    expect(source).toMatch(/<html lang=["']es["']/);
    expect(source).toMatch(/<title>Orvel<\/title>/);
  });

  it('disallows private surfaces in robots.txt and points Sitemap at the marketing sitemap', async () => {
    const source = await readFile(ROBOTS, 'utf8');

    expect(source).toMatch(/Disallow:\s*\/billing/);
    expect(source).toMatch(/Disallow:\s*\/auth/);
    expect(source).toMatch(/Disallow:\s*\/dashboard/);
    expect(source).toMatch(/Disallow:\s*\/booking\/manage/);
    expect(source).toMatch(/Sitemap:\s*https:\/\/orvel\.pro\/sitemap\.xml/);
  });

  it('lists only marketing URLs in sitemap.xml', async () => {
    const source = await readFile(SITEMAP, 'utf8');

    expect(source).toContain('https://orvel.pro/');
    expect(source).toContain('https://orvel.pro/plan');
    expect(source).toContain('https://orvel.pro/terminos-y-condiciones');
    expect(source).not.toContain('/lanzamiento');
    expect(source).not.toMatch(/https:\/\/orvel\.pro\/booking\//);
    expect(source).not.toContain('/billing');
    expect(source).not.toContain('/auth');
    expect(source).not.toContain('/dashboard');
  });

  it('checks in og-share.png as a 1200 by 630 PNG', async () => {
    const bytes = await readFile(OG_SHARE);
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(bytes.subarray(0, 8).equals(pngSignature)).toBe(true);
    expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
  });

  it('demotes CTA heading, promotes Roadmap title, and keeps one h1 on lanzamiento and plan', async () => {
    const cta = await readFile(new URL('../components/organisms/CTA.astro', import.meta.url), 'utf8');
    const roadmap = await readFile(new URL('../components/organisms/Roadmap.astro', import.meta.url), 'utf8');
    const lanzamiento = await composedPage(new URL('../pages/lanzamiento.astro', import.meta.url));
    const plan = await composedPage(new URL('../pages/plan.astro', import.meta.url));

    expect(cta).not.toMatch(/<h1\b/);
    expect(roadmap).toMatch(/<h1\b/);
    expect(countH1(lanzamiento)).toBe(1);
    expect(countH1(plan)).toBe(1);
  });

  it('points Footer Instagram at the Orvel profile URL', async () => {
    const source = await readFile(new URL('../components/organisms/Footer.astro', import.meta.url), 'utf8');

    expect(source).toContain('https://www.instagram.com/orvel.pro/');
    expect(source).not.toMatch(/href=["']#["']/);
  });

  it('emits Organization and SoftwareApplication JSON-LD only from index.astro', async () => {
    const index = await readFile(new URL('../pages/index.astro', import.meta.url), 'utf8');
    const plan = await readFile(new URL('../pages/plan.astro', import.meta.url), 'utf8');

    expect(index).toMatch(/Organization/);
    expect(index).toMatch(/SoftwareApplication/);
    expect(index).toMatch(/application\/ld\+json/);
    expect(plan).not.toMatch(/Organization/);
    expect(plan).not.toMatch(/SoftwareApplication/);
    expect(plan).not.toMatch(/application\/ld\+json/);
  });

  it('locks home layout title and description to category SEO copy', async () => {
    const index = await readFile(new URL('../pages/index.astro', import.meta.url), 'utf8');

    expect(index).toContain('Orvel — Software de gestión de turnos para peluquería, uñas y barbería');
    expect(index).toContain(
      'Agenda online para negocios de belleza en Argentina. El cliente reserva por un link; vos ves la agenda. Seña por alias o CBU, sin Mercado Pago. 14 días de Premium gratis.',
    );
  });

  it('enriches home SoftwareApplication with description and featureList, without ratings', async () => {
    const index = await readFile(new URL('../pages/index.astro', import.meta.url), 'utf8');

    expect(index).toContain(
      'Agenda online para negocios de belleza en Argentina. El cliente reserva por un link; vos ves la agenda. Seña por alias o CBU, sin Mercado Pago. 14 días de Premium gratis.',
    );
    expect(index).toMatch(/featureList/);
    expect(index).toContain('Agenda de turnos');
    expect(index).toContain('Turnero público por link');
    expect(index).toContain('Varios profesionales');
    expect(index).toContain('Seña por alias o CBU');
    expect(index).not.toMatch(/aggregateRating/);
  });

  it('emits FAQPage JSON-LD from the home FAQ component', async () => {
    const faq = await readFile(
      new URL('../components/organisms/prelaunch/PrelaunchFaq.astro', import.meta.url),
      'utf8',
    );
    const plan = await readFile(new URL('../pages/plan.astro', import.meta.url), 'utf8');

    expect(faq).toMatch(/FAQPage/);
    expect(faq).toMatch(/application\/ld\+json/);
    expect(plan).not.toMatch(/Organization/);
    expect(plan).not.toMatch(/SoftwareApplication/);
    expect(plan).not.toMatch(/application\/ld\+json/);
  });

  it('keeps the home h1 and adds crawlable category copy after the lead', async () => {
    const hero = await readFile(
      new URL('../components/organisms/prelaunch/PrelaunchHero.astro', import.meta.url),
      'utf8',
    );

    expect(hero).toContain('Menos ida y vuelta.');
    expect(hero).toContain('Más salón.');
    expect(hero).toContain('Tu cliente reserva. Vos atendés. El celular deja de mandar.');
    expect(hero).toContain(
      'Software de gestión de turnos para peluquerías, uñas, barberías y estética.',
    );
  });

  it('marks billing subscription and the custom 404 as noindex, nofollow Layout pages', async () => {
    const billing = await readFile(new URL('../pages/billing/subscription.astro', import.meta.url), 'utf8');
    const notFound = await readFile(new URL('../pages/404.astro', import.meta.url), 'utf8');

    expect(billing).toMatch(/robots=["']noindex, nofollow["']/);
    expect(notFound).toMatch(/layouts\/Layout\.astro/);
    expect(notFound).toMatch(/robots=["']noindex, nofollow["']/);
  });


  it('keeps leftover auth pages as 302 redirects without Layout identity', async () => {
    const authPages = [
      new URL('../pages/auth.astro', import.meta.url),
      new URL('../pages/auth/login.astro', import.meta.url),
      new URL('../pages/auth/signup/account.astro', import.meta.url),
      new URL('../pages/auth/signup/complete.astro', import.meta.url),
      new URL('../pages/auth/signup/credentials.astro', import.meta.url),
      new URL('../pages/auth/signup/onboarding.astro', import.meta.url),
      new URL('../pages/auth/signup/plan.astro', import.meta.url),
    ];

    for (const page of authPages) {
      const source = await readFile(page, 'utf8');
      expect(source).toMatch(/Astro\.redirect\(/);
      expect(source).toMatch(/,\s*302\s*\)/);
      expect(source).not.toMatch(/layouts\/Layout\.astro/);
      expect(source).not.toMatch(/application\/ld\+json/);
    }
  });

  it('does not list tenant booking slugs and does not use logo.png as share image', async () => {
    const sitemap = await readFile(SITEMAP, 'utf8');
    const layout = await readFile(LAYOUT, 'utf8');
    const middleware = await readFile(new URL('../middleware.ts', import.meta.url), 'utf8');
    const lanzamiento = await readFile(new URL('../pages/lanzamiento.astro', import.meta.url), 'utf8');

    expect(sitemap).not.toMatch(/\/booking\/[A-Za-z0-9-]+/);
    expect(layout).not.toMatch(/(og:image|twitter:image)[\s\S]{0,80}logo\.png/);
    expect(middleware).toContain("/auth/signup/credentials");
    expect(middleware).toMatch(/302/);
    expect(middleware).not.toMatch(/booking-share|HTMLRewriter|resolve_business_by_slug/);
    expect(lanzamiento).not.toMatch(/redirect\([^,]+,\s*301/);
  });

});
