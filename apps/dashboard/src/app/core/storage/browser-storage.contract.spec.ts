import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { browserStorage } from './browser-storage.adapter';

/**
 * Fase 1 of #1098 — the storage boundary of the shared core.
 *
 * The core has to run without a DOM (Node), so `core/*` reaches Web Storage
 * through `storage/storage.port.ts` and never through `window.localStorage`.
 * `storage/browser-storage.adapter.ts` is the single allowed exception, and it
 * is the file that knows how to degrade when there is no `window` at all.
 *
 * The boundary is enforced against the real tree, not against prose: a new
 * direct access fails here instead of only failing in Node by accident.
 */

const CORE_DIR = resolve(process.cwd(), 'src/app/core');
const ADAPTER_FILE = 'storage/browser-storage.adapter.ts';
const WEB_STORAGE_ACCESS = /\b(?:window\.)?(?:local|session)Storage\b/;

function productionFiles(dir: string = CORE_DIR): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...productionFiles(absolute));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      files.push(absolute);
    }
  }

  return files;
}

/** Comments may name Web Storage; only code counts. Line numbers must survive. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function webStorageOffenders(): string[] {
  const offenders: string[] = [];

  for (const file of productionFiles()) {
    const id = relative(CORE_DIR, file).split('\\').join('/');
    if (id === ADAPTER_FILE) {
      continue;
    }

    const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      if (WEB_STORAGE_ACCESS.test(line)) {
        offenders.push(`${id}:${index + 1}`);
      }
    });
  }

  return offenders;
}

describe('core storage boundary contract', () => {
  it('reaches Web Storage only through the storage port', () => {
    expect(webStorageOffenders()).toEqual([]);
  });

  it('keeps the browser adapter as the only core file that reads window.localStorage', () => {
    const readers = productionFiles()
      .filter((file) => /window\.localStorage/.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(CORE_DIR, file).split('\\').join('/'));

    expect(readers).toEqual([ADAPTER_FILE]);
  });

  it('resolves to null when there is no window, so core code can run in Node', () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;

    try {
      expect(browserStorage()).toBeNull();
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  it('hands back the browser Web Storage when a window exists', () => {
    const storage = browserStorage();

    expect(storage).not.toBeNull();
    storage?.setItem('orvel.storage-port.probe', 'ok');
    expect(storage?.getItem('orvel.storage-port.probe')).toBe('ok');
    storage?.removeItem('orvel.storage-port.probe');
    expect(storage?.getItem('orvel.storage-port.probe')).toBeNull();
  });
});
