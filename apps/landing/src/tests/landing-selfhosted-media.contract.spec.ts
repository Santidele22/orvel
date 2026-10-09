// Guard: the landing self-hosts its media.
//
// The deployment ships a tight CSP (`img-src 'self' data: blob: …`, and media
// falls back to `default-src 'self'` because there is no `media-src`), so every
// image and video the landing renders has to come from `public/`. This test
// fails if a source file hotlinks an image/video host again, and fails if a
// referenced `/images/…` or `/videos/…` asset is missing from the repository.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SRC_DIR = new URL('../', import.meta.url);
const PUBLIC_DIR = new URL('../../public/', import.meta.url);
const EXTERNAL_MEDIA_HOST =
  /images\.unsplash\.com|images\.pexels\.com|picsum\.photos|assets\.mixkit\.co|cdn\.coverr\.co|videos\.pexels\.com/;

const sourceFiles = readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })
  .filter((file) => !file.startsWith('tests/'))
  .filter((file) => /\.(astro|svelte|ts|css|html)$/.test(file));

describe('Contract: the landing self-hosts its media', () => {
  it('keeps external media hosts out of the source', () => {
    for (const file of sourceFiles) {
      const source = readFileSync(new URL(file, SRC_DIR), 'utf8');
      expect(source, `${file} must not hotlink a media host`).not.toMatch(EXTERNAL_MEDIA_HOST);
    }
  });

  it('ships every referenced /images and /videos asset', () => {
    const missing: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(new URL(file, SRC_DIR), 'utf8');
      for (const match of source.matchAll(/["'`]\/(images|videos)\/([A-Za-z0-9._-]+)["'`]/g)) {
        if (!existsSync(new URL(`${match[1]}/${match[2]}`, PUBLIC_DIR))) {
          missing.push(`${file} -> ${match[1]}/${match[2]}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
