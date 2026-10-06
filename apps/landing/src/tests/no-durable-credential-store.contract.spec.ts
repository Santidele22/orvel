import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The landing is a public marketing origin. It used to keep two durable copies of
 * an operator session in Web Storage: the Supabase client's own entry under the
 * shared `orvel.supabase.auth` key, and a second, landing-owned `orvel.session.v1`
 * entry holding an AES-GCM blob. The second one was worse than useless: the
 * encryption key was generated per page load and kept only in memory, so the blob
 * could never be decrypted after a reload, and no module in the app ever read it.
 *
 * Audit finding S2 (`docs/audits/2026-09-28-dashboard-audit.md`) is what makes this
 * costly: any XSS on the landing origin can read whatever durable session lives
 * there. This contract keeps credentials out of Web Storage on the landing so the
 * only thing an injected script can reach is public, non-secret state.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const landingSrc = resolve(__dirname, '..');

const SOURCE_EXTENSIONS = ['.ts', '.astro', '.svelte'];
const SECRET_IDENTIFIER =
  /(^|[^A-Za-z0-9_])(tokens?|access[_-]?tokens?|refresh[_-]?tokens?|sessions?|jwts?|passwords?|secrets?|api[_-]?keys?)([^A-Za-z0-9_]|$)/i;

async function listProductionSources(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'tests' || entry.name === 'node_modules') continue;
      files.push(...(await listProductionSources(fullPath)));
      continue;
    }
    if (!SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) continue;
    if (entry.name.includes('.spec.') || entry.name.includes('.test.')) continue;
    files.push(fullPath);
  }

  return files;
}

/** Text between the parentheses of every `<storage>.setItem(` call in a file. */
function setItemPayloads(source: string): string[] {
  const payloads: string[] = [];
  const needle = 'Storage.setItem(';

  let index = source.indexOf(needle);
  while (index !== -1) {
    let depth = 0;
    let cursor = index + needle.length - 1;
    const start = cursor + 1;
    for (; cursor < source.length; cursor += 1) {
      const char = source[cursor];
      if (char === '(') depth += 1;
      if (char === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    payloads.push(source.slice(start, cursor));
    index = source.indexOf(needle, cursor);
  }

  return payloads;
}

describe('landing durable credential storage', () => {
  it('never writes a session or token to Web Storage', async () => {
    const sources = await listProductionSources(landingSrc);
    expect(sources.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of sources) {
      const source = await readFile(file, 'utf8');
      for (const payload of setItemPayloads(source)) {
        if (SECRET_IDENTIFIER.test(payload)) {
          offenders.push(`${file.replace(landingSrc, 'src')}: ${payload.replace(/\s+/g, ' ').trim()}`);
        }
      }
    }

    expect(
      offenders,
      'The landing must not keep credentials in Web Storage (audit S2). Hold the session in memory and hand it off, or use an httpOnly cookie.',
    ).toEqual([]);
  });

  it('keeps no landing-owned auth session key in the bundle', async () => {
    const sources = await listProductionSources(landingSrc);
    const offenders: string[] = [];

    for (const file of sources) {
      const source = await readFile(file, 'utf8');
      if (/orvel\.session/.test(source)) {
        offenders.push(file.replace(landingSrc, 'src'));
      }
    }

    expect(offenders, 'orvel.session.* was a write-only durable token store; do not reintroduce it.').toEqual([]);
  });

  it('does not know the app session key at all', async () => {
    const sources = await listProductionSources(landingSrc);
    const offenders: string[] = [];

    for (const file of sources) {
      const source = await readFile(file, 'utf8');
      // ADR 0012 rule 1: each execution target owns its key and nothing imports another's, and the
      // landing owns none. The landing used to re-declare the app's literal and persist under it.
      if (/orvel\.supabase\.auth/.test(source)) {
        offenders.push(file.replace(landingSrc, 'src'));
      }
    }

    expect(
      offenders,
      'The landing must not resolve the app session key; the pwa and web targets own their own (ADR 0012).',
    ).toEqual([]);
  });
});
