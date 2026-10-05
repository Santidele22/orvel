import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RpcClient } from '../api/rpc.port';
import {
  DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE,
  normalizeDashboardReferenceCatalog
} from '../catalog/reference-catalog';
import { createDashboardReferenceCatalogGateway } from '../catalog/reference-catalog.gateway';

/**
 * Fase 1 of #1098 — one gate for the whole boundary of the shared core.
 *
 * The core has to run where there is no DOM and no Supabase SDK (Node tests
 * today, SSR, and the native target later), so `core/*` reaches the host only
 * through ports. This is the machine-checkable form of that sentence: it walks
 * the real tree and fails when a core file breaks a rule outside its declared
 * adapter.
 *
 * Every exemption is a *named file with a reason*, never a catch-all, so adding
 * one is a deliberate edit a reviewer sees. Fase 2 removed the last one: the
 * `matchMedia` detector that used to live in `core/shell/is-mobile/` now reads
 * the host through `platform/platform.adapter.ts` like everything else.
 */
const CORE_DIR = resolve(process.cwd(), 'src/app/core');

const STORAGE_ADAPTER = 'storage/browser-storage.adapter.ts';
const ENVIRONMENT_ADAPTER = 'platform/browser-environment.adapter.ts';
const PLATFORM_ADAPTER = 'platform/platform.adapter.ts';

const SDK_ADAPTERS = [
  'adapters/supabase/branch-context.adapter.ts',
  'adapters/supabase/supabase-auth.client.ts',
  'adapters/supabase/supabase-client.factory.ts',
  'adapters/supabase/supabase-client.ts'
] as const;

const HOST_ADAPTERS = [ENVIRONMENT_ADAPTER, STORAGE_ADAPTER, PLATFORM_ADAPTER] as const;

const SDK_IMPORT = /(?:from|import)\s*\(?\s*['"]@supabase\/supabase-js['"]/;
const HOST_ACCESS = /\b(?:window|document|navigator)\b|\b(?:local|session)Storage\b/;

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

function coreId(file: string): string {
  return relative(CORE_DIR, file).split('\\').join('/');
}

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

/** Compiler directives stay; comments may name anything. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Host access is matched on code, not on prose: message strings in this
 * codebase legitimately contain the word "window" (for example "Policy window
 * closed"), and a string is never host access.
 */
function stripCommentsAndStrings(source: string): string {
  return stripComments(source).replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g, "''");
}

function offenders(matches: (source: string) => boolean, allowed: readonly string[]): string[] {
  return productionFiles()
    .filter((file) => !allowed.includes(coreId(file)))
    .filter((file) => matches(read(file)))
    .map(coreId)
    .sort();
}

describe('core boundary contract', () => {
  it('confines the Supabase SDK to core/adapters/supabase', () => {
    const importers = productionFiles()
      .filter((file) => SDK_IMPORT.test(stripComments(read(file))))
      .map(coreId)
      .sort();

    expect(importers.filter((id) => !id.startsWith('adapters/'))).toEqual([]);
    expect(importers).toEqual([...SDK_ADAPTERS].sort());
  });

  it('reaches the host only through the declared adapters', () => {
    const allowed = [...HOST_ADAPTERS];

    expect(offenders((source) => HOST_ACCESS.test(stripCommentsAndStrings(source)), allowed)).toEqual([]);
  });

  it('runs core logic with every DOM global absent', async () => {
    const scope = globalThis as { window?: unknown; document?: unknown; localStorage?: unknown };
    const previous = { window: scope.window, document: scope.document, localStorage: scope.localStorage };
    delete scope.window;
    delete scope.document;
    delete scope.localStorage;

    try {
      const { browserStorage } = await import('../storage/browser-storage.adapter');
      const { browserEnvironment } = await import('../platform/browser-environment.adapter');
      const { BranchContextService } = await import('../branches/branch-context.service');

      expect(browserStorage()).toBeNull();

      const environment = browserEnvironment();
      expect(environment.isVisible()).toBe(true);
      expect(environment.currentOrigin()).toBe('');
      expect(() => {
        environment.navigateTo('/dashboard/login');
      }).not.toThrow();
      await expect(environment.writeClipboardText('orvel.pagos')).resolves.toBe(false);

      const branchContext = new BranchContextService({
        readSession: async () => ({ userId: 'user-1', userMetadata: { business_id: 'business-1' } }),
        listDashboardBranches: async () => [
          { id: 'branch-1', name: 'Principal', business_id: 'business-1' }
        ],
        listOwnedBusinesses: async () => [{ id: 'business-1' }]
      });

      await branchContext.ensureLoaded();

      expect(branchContext.activeBranchId()).toBe('branch-1');
    } finally {
      scope.window = previous.window;
      scope.document = previous.document;
      scope.localStorage = previous.localStorage;
    }
  });
});

describe('core ports are usable without the SDK', () => {
  it('drives core code from a plain fake rpc client, with the SDK nowhere in sight', async () => {
    const calls: string[] = [];
    const fakeRpc: RpcClient = {
      async rpc(name: string) {
        calls.push(name);
        return { data: DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE, error: null };
      }
    };

    const catalog = await createDashboardReferenceCatalogGateway(fakeRpc).getDashboardReferenceCatalog();

    expect(calls).toEqual(['get_dashboard_reference_catalog']);
    expect(catalog).toEqual(normalizeDashboardReferenceCatalog(DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE));
  });

  it('surfaces an rpc failure through the port without leaking SDK error objects', async () => {
    const fakeRpc: RpcClient = {
      async rpc() {
        return { data: null, error: { message: 'CATALOG_DOWN' } };
      }
    };

    await expect(
      createDashboardReferenceCatalogGateway(fakeRpc).getDashboardReferenceCatalog()
    ).rejects.toThrow('CATALOG_DOWN');
  });
});
