import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const INDEX_PATH = new URL('../pages/index.astro', import.meta.url);
const DOWNLOAD_APP_PATH = new URL('../components/organisms/DownloadApp.astro', import.meta.url);

async function source(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

function expectVisibleAnchorTo(sourceText: string, label: RegExp, href: string): void {
  expect(sourceText).toMatch(
    new RegExp(`<a[^>]+href=["']${href}["'][^>]*>[\\s\\S]*${label.source}[\\s\\S]*<\\/a>`, 'i'),
  );
}

describe('Contract: landing download-app section installs the dashboard PWA', () => {
  it('mounts DownloadApp on the launch home before the final CTA', async () => {
    const index = await source(INDEX_PATH);

    expect(index).toMatch(/import DownloadApp from ['"]\.\.\/components\/organisms\/DownloadApp\.astro['"]/);
    expect(index).toMatch(/<DownloadApp\s*\/>/);
    expect(index).not.toMatch(/<!--\s*<DownloadApp\s*\/>\s*-->/);
    expect(index).toMatch(/<DownloadApp\s*\/>\s*<CTA\s*\/>/);
  });

  it('renders a download heading and a dashboard install CTA, never store badges', async () => {
    const downloadApp = await source(DOWNLOAD_APP_PATH);

    expect(downloadApp).toMatch(/id=["']descargar["']/);
    expect(downloadApp).toMatch(/<(h1|h2)[^>]*>[\s\S]*(descarg|instal)[\s\S]*<\/(h1|h2)>/i);
    expectVisibleAnchorTo(downloadApp, /Instalar app|Descargar app/, '/dashboard/');
    expect(downloadApp).not.toMatch(/play\.google\.com|apps\.apple\.com|store badge/i);
  });
});
