import type { BookingShareHead } from './booking-share-head';

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function replaceTitle(html: string, title: string): string {
  if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  }
  return html.replace(/<head([^>]*)>/i, `<head$1><title>${title}</title>`);
}

function upsertMeta(html: string, attr: 'name' | 'property', key: string, content: string): string {
  const encoded = escapeAttr(content);
  const pattern = new RegExp(
    `<meta\\b[^>]*(?:${attr}=["']${key}["'][^>]*content=["'][^"']*["']|content=["'][^"']*["'][^>]*${attr}=["']${key}["'])[^>]*>`,
    'i',
  );
  const tag = `<meta ${attr}="${key}" content="${encoded}">`;
  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }
  return html.replace(/<\/head>/i, `${tag}</head>`);
}

function upsertCanonical(html: string, href: string): string {
  const encoded = escapeAttr(href);
  const pattern = /<link\b[^>]*rel=["']canonical["'][^>]*>/i;
  const tag = `<link rel="canonical" href="${encoded}">`;
  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }
  return html.replace(/<\/head>/i, `${tag}</head>`);
}

export function rewriteBookingShareHead(html: string, head: BookingShareHead): string {
  let next = replaceTitle(html, head.title);
  next = upsertMeta(next, 'name', 'description', head.description);
  next = upsertCanonical(next, head.canonicalUrl);
  next = upsertMeta(next, 'name', 'robots', head.robots);
  next = upsertMeta(next, 'property', 'og:title', head.title);
  next = upsertMeta(next, 'property', 'og:description', head.description);
  next = upsertMeta(next, 'property', 'og:url', head.canonicalUrl);
  next = upsertMeta(next, 'property', 'og:image', head.imageUrl);
  next = upsertMeta(next, 'name', 'twitter:title', head.title);
  next = upsertMeta(next, 'name', 'twitter:description', head.description);
  next = upsertMeta(next, 'name', 'twitter:image', head.imageUrl);
  return next;
}
