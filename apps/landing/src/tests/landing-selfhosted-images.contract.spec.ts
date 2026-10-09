// Guard: the landing self-hosts its imagery.
//
// The deployment ships a tight CSP (`img-src 'self' data: blob: …`), so every
// image the landing renders has to come from `public/images/`. This test fails
// if a source file hotlinks an image host again, and fails if a referenced
// `/images/...` asset is missing from the repository.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SRC_DIR = new URL('../', import.meta.url);
const PUBLIC_DIR = new URL('../../public/', import.meta.url);

const sourceFiles = readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })
  .filter((file) => !file.startsWith('tests/'))
  .filter((file) => /\.(astro|svelte|ts|css|html)$/.test(file));

describe('Contract: the landing self-hosts its images', () => {
  it('keeps external image hosts out of the source', () => {
    for (const file of sourceFiles) {
      const source = readFileSync(new URL(file, SRC_DIR), 'utf8');
      expect(source, `${file} must not hotlink an image host`).not.toMatch(
        /images\.unsplash\.com|images\.pexels\.com|picsum\.photos/,
      );
    }
  });

  it('ships every referenced /images asset', () => {
    const missing: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(new URL(file, SRC_DIR), 'utf8');
      for (const match of source.matchAll(/["'`]\/images\/([A-Za-z0-9._-]+)["'`]/g)) {
        if (!existsSync(new URL(`images/${match[1]}`, PUBLIC_DIR))) {
          missing.push(`${file} -> images/${match[1]}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
