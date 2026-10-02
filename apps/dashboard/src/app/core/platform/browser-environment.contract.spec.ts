import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { browserEnvironment } from './browser-environment.adapter';

/**
 * Fase 1 of #1098 — the browser-environment boundary of the shared core.
 *
 * The core has to run without a DOM, so `core/*` does not touch `document` or
 * subscribe to `window` events directly: it goes through the port in
 * `platform/browser-environment.port.ts`, whose adapter degrades to a silent,
 * visible environment when there is no host.
 *
 * The boundary is enforced against the real tree, so a new direct access fails
 * here instead of only failing in Node by accident.
 */

const CORE_DIR = resolve(process.cwd(), 'src/app/core');
const ADAPTER_FILE = 'platform/browser-environment.adapter.ts';
const DIRECT_DOM_ACCESS = /\bdocument\.|window\.(?:addEventListener|removeEventListener|dispatchEvent)\b/;

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

/** Comments may name the DOM; only code counts. Line numbers must survive. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function directDomOffenders(): string[] {
  const offenders: string[] = [];

  for (const file of productionFiles()) {
    const id = relative(CORE_DIR, file).split('\\').join('/');
    if (id === ADAPTER_FILE) {
      continue;
    }

    stripComments(readFileSync(file, 'utf8'))
      .split('\n')
      .forEach((line, index) => {
        if (DIRECT_DOM_ACCESS.test(line)) {
          offenders.push(`${id}:${index + 1}`);
        }
      });
  }

  return offenders;
}

type Listener = () => void;

function installGlobals(globals: { window?: unknown; document?: unknown }): () => void {
  const scope = globalThis as { window?: unknown; document?: unknown };
  const previousWindow = scope.window;
  const previousDocument = scope.document;

  if ('window' in globals) {
    scope.window = globals.window;
  }
  if ('document' in globals) {
    scope.document = globals.document;
  }

  return () => {
    scope.window = previousWindow;
    scope.document = previousDocument;
  };
}

function withoutHost(): () => void {
  const scope = globalThis as { window?: unknown; document?: unknown };
  delete scope.window;
  delete scope.document;

  return installGlobals({ window: undefined, document: undefined });
}

describe('core browser-environment boundary contract', () => {
  it('reaches browser events and visibility only through the browser environment port', () => {
    expect(directDomOffenders()).toEqual([]);
  });

  it('keeps the browser environment adapter as the only core file that touches the DOM directly', () => {
    const readers = productionFiles()
      .filter((file) => DIRECT_DOM_ACCESS.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(CORE_DIR, file).split('\\').join('/'));

    expect(readers).toEqual([ADAPTER_FILE]);
  });

  it('degrades to a visible, silent environment when there is no host', () => {
    const restore = withoutHost();

    try {
      const environment = browserEnvironment();

      expect(environment.isVisible()).toBe(true);
      expect(() => {
        environment.dispatchWindowEvent('booking.created', { id: '1' });
      }).not.toThrow();

      const unsubscribe = environment.onWindowEvent('booking.created', () => undefined);
      expect(typeof unsubscribe).toBe('function');
      expect(() => {
        unsubscribe();
      }).not.toThrow();

      const unsubscribeVisibility = environment.onVisibilityChange(() => undefined);
      expect(() => {
        unsubscribeVisibility();
      }).not.toThrow();
    } finally {
      restore();
    }
  });

  it('subscribes and unsubscribes window events through the host window', () => {
    const registered: Array<{ type: string; listener: Listener }> = [];
    const removed: Array<{ type: string; listener: Listener }> = [];
    const restore = installGlobals({
      window: {
        addEventListener: (type: string, listener: Listener) => {
          registered.push({ type, listener });
        },
        removeEventListener: (type: string, listener: Listener) => {
          removed.push({ type, listener });
        },
        dispatchEvent: () => true
      }
    });

    try {
      const listener: Listener = () => undefined;
      const unsubscribe = browserEnvironment().onWindowEvent('booking.created', listener);

      expect(registered).toEqual([{ type: 'booking.created', listener }]);
      unsubscribe();
      expect(removed).toEqual([{ type: 'booking.created', listener }]);
    } finally {
      restore();
    }
  });

  it('dispatches window events as a CustomEvent carrying the detail', () => {
    const dispatched: Event[] = [];
    const restore = installGlobals({
      window: {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: (event: Event) => {
          dispatched.push(event);
          return true;
        }
      }
    });

    try {
      browserEnvironment().dispatchWindowEvent('operator.agenda.sync', { branchId: 'b1' });

      expect(dispatched).toHaveLength(1);
      expect(dispatched[0].type).toBe('operator.agenda.sync');
      expect((dispatched[0] as CustomEvent).detail).toEqual({ branchId: 'b1' });
    } finally {
      restore();
    }
  });

  it('reads visibility from the host document and subscribes to visibilitychange', () => {
    const registered: Array<{ type: string; listener: Listener }> = [];
    const removed: Array<{ type: string; listener: Listener }> = [];
    const documentHost = {
      visibilityState: 'hidden' as DocumentVisibilityState,
      addEventListener: (type: string, listener: Listener) => {
        registered.push({ type, listener });
      },
      removeEventListener: (type: string, listener: Listener) => {
        removed.push({ type, listener });
      }
    };
    const restore = installGlobals({ document: documentHost });

    try {
      const environment = browserEnvironment();
      expect(environment.isVisible()).toBe(false);

      documentHost.visibilityState = 'visible';
      expect(environment.isVisible()).toBe(true);

      const listener: Listener = () => undefined;
      const unsubscribe = environment.onVisibilityChange(listener);
      expect(registered).toEqual([{ type: 'visibilitychange', listener }]);

      unsubscribe();
      expect(removed).toEqual([{ type: 'visibilitychange', listener }]);
    } finally {
      restore();
    }
  });
});
