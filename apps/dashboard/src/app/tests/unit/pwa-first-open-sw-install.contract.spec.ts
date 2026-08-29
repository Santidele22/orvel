import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

type AssetGroup = {
  name: string;
  installMode?: string;
  updateMode?: string;
  resources?: { files?: string[]; urls?: string[] };
};

describe('Contract: PWA first-open SW install', () => {
  it('prefetches only the app shell and lazy-installs remaining JS/CSS/HTML', () => {
    const config = JSON.parse(source('src/ngsw-config.json')) as {
      assetGroups?: AssetGroup[];
    };
    const groups = config.assetGroups ?? [];
    const prefetchGroups = groups.filter((group) => group.installMode === 'prefetch');
    const shell = prefetchGroups.find((group) => {
      const files = group.resources?.files ?? [];
      return (
        files.some((file) => file.includes('index.html')) &&
        files.some((file) => file.includes('manifest'))
      );
    });
    const shellFiles = shell?.resources?.files ?? [];

    expect(shell).toBeDefined();
    expect(shellFiles.some((file) => file.includes('index.html'))).toBe(true);
    expect(shellFiles.some((file) => file.includes('manifest'))).toBe(true);
    expect(shellFiles).not.toContain('/icons/*.png');
    expect(shell?.resources?.urls).toEqual([
      '/dashboard/icons/icon-192x192.png',
      '/dashboard/icons/icon-512x512.png'
    ]);
    expect(shellFiles).not.toContain('/**/*.js');
    expect(shellFiles).not.toContain('/**/*.css');

    const lazyApp = groups.find((group) => {
      const files = group.resources?.files ?? [];
      return (
        group.installMode === 'lazy' &&
        files.includes('/**/*.js') &&
        files.includes('/**/*.css') &&
        files.includes('/**/*.html')
      );
    });

    expect(lazyApp).toBeDefined();
    expect(lazyApp?.installMode).toBe('lazy');
  });

  it('activates the push SW immediately with skipWaiting and clients.claim', () => {
    const pushSw = source('src/orvel-push-sw.js');

    expect(pushSw).toContain("importScripts('./ngsw-worker.js')");
    expect(pushSw).toContain('skipWaiting');
    expect(pushSw).toContain('clients.claim');
  });
});
