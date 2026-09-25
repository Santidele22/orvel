import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { toBookingShareHead } from '../lib/booking-share-head';
import { isTenantBookingSharePath } from '../lib/booking-share-match';
import { rewriteBookingShareHead } from '../lib/booking-share-rewriter';

const DASHBOARD_INDEX = new URL('../../../../apps/dashboard/src/index.html', import.meta.url);

const SECRET_ALIAS = 'NORA.ALIAS.MP';
const SECRET_CBU = '0000003100012345678901';
const SECRET_PHONE = '+5491112345678';
const SECRET_EMAIL = 'owner-nora@example.com';
const SECRET_TOKEN = 'tok_secret_abc123';

const RPC_DUMP = {
  id: 'biz-1',
  name: 'Nails Nora',
  slug: 'nails-nora',
  depositAlias: SECRET_ALIAS,
  depositCbu: SECRET_CBU,
  supportPhone: SECRET_PHONE,
  ownerEmail: SECRET_EMAIL,
  manageToken: SECRET_TOKEN,
};

const SERVICES = ['Manicura', 'Pedicura', 'Kapping', 'Esmaltado', 'Manicura $9000'];

const SHELL = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Orvel</title>
  <link rel="manifest" href="/dashboard/manifest.webmanifest">
  <link rel="apple-touch-icon" href="/dashboard/icons/icon-192x192.png">
</head>
<body>
  <script src="/dashboard/main.js"></script>
  <app-root></app-root>
</body>
</html>`;

function serializedHead(head: unknown) {
  return JSON.stringify(head);
}

function secrets() {
  return [SECRET_ALIAS, SECRET_CBU, SECRET_PHONE, SECRET_EMAIL, SECRET_TOKEN];
}

describe('Contract: booking share head mapper', () => {
  it('maps a resolved business to title, canonical, robots, and a price-free description', () => {
    const head = toBookingShareHead({
      slug: 'nails-nora',
      resolved: RPC_DUMP,
      serviceNames: SERVICES,
    });

    expect(head.title).toBe('Nails Nora · Reservá turno | Orvel');
    expect(head.canonicalUrl).toBe('https://orvel.pro/booking/nails-nora');
    expect(head.robots).toBe('noindex, follow');
    expect(head.description.startsWith('Nails Nora: reservá turno online.')).toBe(true);
    expect(head.imageUrl).toBe('https://orvel.pro/og-share.png');
    expect(head.imageUrl).not.toContain('logo.png');

    const namedServices = SERVICES.filter((name) => !name.includes('$')).slice(0, 3);
    for (const name of namedServices) {
      expect(head.description).toContain(name);
    }
    expect(head.description).not.toContain('Esmaltado');
    expect(head.description).not.toMatch(/\$|precio|ARS|USD/i);

    const blob = serializedHead(head);
    for (const secret of secrets()) {
      expect(blob).not.toContain(secret);
    }
    expect(blob).not.toContain('"depositAlias"');
  });

  it('uses a generic Orvel title and noindex when the name is missing', () => {
    const head = toBookingShareHead({ slug: 'unknown-salon', resolved: null, serviceNames: [] });

    expect(head.title).toBe('Orvel');
    expect(head.robots).toBe('noindex');
    expect(head.canonicalUrl).toBe('https://orvel.pro/booking/unknown-salon');
    expect(head.imageUrl).toBe('https://orvel.pro/og-share.png');
  });

  it('canonicalizes nested professional slugs to /booking/{slug}', () => {
    const head = toBookingShareHead({
      slug: 'nails-nora/ana',
      resolved: RPC_DUMP,
      serviceNames: ['Manicura'],
    });

    expect(head.canonicalUrl).toBe('https://orvel.pro/booking/nails-nora');
    expect(head.canonicalUrl).not.toContain('/ana');
  });
});

describe('Contract: tenant booking share path match', () => {
  it('accepts tenant and nested professional paths and rejects manage and token query', () => {
    expect(isTenantBookingSharePath('/booking/nails-nora', '')).toBe(true);
    expect(isTenantBookingSharePath('/booking/nails-nora/ana', '')).toBe(true);
    expect(isTenantBookingSharePath('/booking/manage', '')).toBe(false);
    expect(isTenantBookingSharePath('/booking/nails-nora', '?token=')).toBe(false);
    expect(isTenantBookingSharePath('/booking/nails-nora', '?token=abc')).toBe(false);
  });
});

describe('Contract: booking share HTML rewriter', () => {
  it('upserts share metadata and keeps the SPA shell tags', async () => {
    const head = toBookingShareHead({
      slug: 'nails-nora',
      resolved: RPC_DUMP,
      serviceNames: SERVICES,
    });
    const html = rewriteBookingShareHead(SHELL, head);
    const dashboardSource = await readFile(DASHBOARD_INDEX, 'utf8');

    expect(html).toContain(`<title>${head.title}</title>`);
    expect(html).toContain(`content="${head.description}"`);
    expect(html).toContain(`href="${head.canonicalUrl}"`);
    expect(html).toContain('property="og:url"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('name="twitter:image"');
    expect(html).toContain('https://orvel.pro/og-share.png');
    expect(html).not.toContain('logo.png');
    expect(html).toContain('name="robots"');
    expect(html).toContain('noindex, follow');
    expect(html).toContain('<app-root>');
    expect(html).toContain('src="/dashboard/main.js"');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).not.toMatch(/<html[^>]*lang="es-AR"/);
    expect(dashboardSource).toMatch(/<html lang=["']es["']/);
    expect(dashboardSource).toMatch(/<title>Orvel<\/title>/);

    const unknown = rewriteBookingShareHead(
      SHELL,
      toBookingShareHead({ slug: 'missing-slug', resolved: null, serviceNames: [] }),
    );
    expect(unknown).toContain('<title>Orvel</title>');
    expect(unknown).toContain('noindex');
    expect(unknown).toContain('<app-root>');
    expect(unknown).not.toMatch(/HTTP\/1\.1 404|Not Found<\/title>/i);
  });

  it('uses a closed-account name, generic head for invalid slugs, and never writes secrets', () => {
    const closed = toBookingShareHead({
      slug: 'nails-nora',
      resolved: { ...RPC_DUMP, accountStatus: 'closed' },
      serviceNames: [],
    });
    expect(closed.title).toBe('Nails Nora · Reservá turno | Orvel');
    expect(closed.title).not.toMatch(/not found|cerrad/i);

    const invalid = toBookingShareHead({
      slug: '***',
      resolved: RPC_DUMP,
      serviceNames: ['Manicura'],
    });
    expect(invalid.title).toBe('Orvel');
    expect(invalid.robots).toBe('noindex');

    const html = rewriteBookingShareHead(SHELL, closed);
    for (const secret of secrets()) {
      expect(html).not.toContain(secret);
    }
  });
});
