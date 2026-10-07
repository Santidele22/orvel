import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Fase 3 of #1098 — the web target must not gain PWA machinery, in source or in config.
 *
 * The artifact contract (`scripts/check-dashboard-web-pwa-artifacts.mjs`) checks what the build
 * emits. This one is the earlier net: it fails the moment someone imports an install/update/push
 * feature or wires a service worker in, before a build ever runs.
 */
const SRC_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const PROJECT_ROOT = resolve(SRC_ROOT, '..');
const REPO_ROOT = resolve(PROJECT_ROOT, '..', '..');

const WEB_ANGULAR_JSON = join(PROJECT_ROOT, 'angular.json');
const WEB_INDEX_HTML = join(SRC_ROOT, 'index.html');
const WEB_APP_CONFIG = join(SRC_ROOT, 'app', 'app.config.ts');
const PWA_ANGULAR_JSON = join(REPO_ROOT, 'apps', 'dashboard', 'angular.json');

const FORBIDDEN_IN_SOURCE = [
  'manifest.webmanifest',
  'ngsw',
  'orvel-push-sw',
  '@angular/service-worker',
  'provideServiceWorker',
  'beforeinstallprompt',
  'features/pwa-install',
  'features/pwa-in-app-update',
  'features/operator-web-push'
] as const;

function read(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

/**
 * Comments may name the machinery this contract forbids — `app.config.ts` explains *why* it does
 * not call `provideServiceWorker`. Only code counts.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function sourceFiles(dir: string = SRC_ROOT): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(absolute));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(ts|html|json)$/.test(entry.name)) continue;
    if (entry.name.endsWith('.spec.ts')) continue;
    files.push(absolute);
  }

  return files;
}

describe('contract: the web target carries no PWA machinery (#1098 Fase 3)', () => {
  it('never references install, update, push or service-worker machinery in its source', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const source = stripComments(read(file));
      for (const token of FORBIDDEN_IN_SOURCE) {
        if (source.includes(token)) {
          offenders.push(`${relative(REPO_ROOT, file)} -> ${token}`);
        }
      }
    }

    expect(offenders, 'The web target must not ship PWA machinery.').toEqual([]);
  });

  it('declares no service worker and no manifest asset in angular.json', () => {
    const angularJson = JSON.parse(read(WEB_ANGULAR_JSON));
    const build = angularJson.projects['orvel-dashboard-web'].architect.build;

    expect(build.options.serviceWorker).toBeUndefined();
    expect(JSON.stringify(build.options.assets)).not.toContain('manifest');

    for (const configuration of Object.values(build.configurations ?? {}) as Record<string, unknown>[]) {
      expect(configuration['serviceWorker']).toBeUndefined();
    }
  });

  it('index.html declares no manifest link', () => {
    expect(read(WEB_INDEX_HTML)).not.toMatch(/rel=["']manifest["']/);
  });

  it('app.config.ts provides no service worker', () => {
    expect(stripComments(read(WEB_APP_CONFIG))).not.toContain('provideServiceWorker');
  });

  it('the PWA keeps its service worker, so the check above is meaningful', () => {
    const angularJson = JSON.parse(read(PWA_ANGULAR_JSON));
    const build = angularJson.projects['salon-de-belleza'].architect.build;

    expect(build.options.serviceWorker).toBe('src/ngsw-config.json');
  });
});
