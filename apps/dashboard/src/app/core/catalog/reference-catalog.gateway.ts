import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '../runtime/supabase-client';
import {
  DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE,
  type DashboardReferenceCatalog,
  normalizeDashboardReferenceCatalog
} from './reference-catalog';

export type DashboardReferenceCatalogRpcClient = Pick<SupabaseClient, 'rpc'>;

export type DashboardReferenceCatalogGateway = {
  getDashboardReferenceCatalog(): Promise<DashboardReferenceCatalog>;
};

export type DashboardReferenceCatalogRepository = DashboardReferenceCatalogGateway & {
  getCachedDashboardReferenceCatalog(): DashboardReferenceCatalog;
  refreshDashboardReferenceCatalog(): Promise<DashboardReferenceCatalog>;
};

let configuredGateway: DashboardReferenceCatalogGateway | null = null;

// Launch/onboarding safety fallback: the runtime snapshot is replaced by the
// Supabase RPC catalog as soon as refreshRuntimeReferenceCatalog() succeeds,
// but the auth/onboarding route must never render an empty 0/1 catalog while
// that remote catalog is unavailable or has not been initialized yet. The
// fixture includes the FREE planBusinessTypes allowlist used by onboarding.
const ONBOARDING_REFERENCE_CATALOG_FALLBACK: DashboardReferenceCatalog = DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE;

function isTestRuntime(): boolean {
  const processLike = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process;
  return processLike?.env?.['NODE_ENV'] === 'test' || processLike?.env?.['VITEST'] === 'true';
}

let runtimeReferenceCatalogSnapshot: DashboardReferenceCatalog = isTestRuntime()
  ? DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE
  : ONBOARDING_REFERENCE_CATALOG_FALLBACK;
let runtimeReferenceCatalogInitialized = false;

export function createDashboardReferenceCatalogGateway(
  supabase: DashboardReferenceCatalogRpcClient
): DashboardReferenceCatalogGateway {
  return {
    async getDashboardReferenceCatalog() {
      const { data, error } = await supabase.rpc('get_dashboard_reference_catalog');

      if (error) {
        throw new Error(error.message ?? 'DASHBOARD_REFERENCE_CATALOG_UNAVAILABLE');
      }

      return normalizeDashboardReferenceCatalog(data);
    }
  };
}

export function configureDashboardReferenceCatalogGateway(gateway: DashboardReferenceCatalogGateway | null): void {
  configuredGateway = gateway;
}

export function getConfiguredDashboardReferenceCatalogGateway(): DashboardReferenceCatalogGateway {
  if (configuredGateway) {
    return configuredGateway;
  }

  return createDashboardReferenceCatalogGateway(createSupabaseClient());
}

export async function fetchDashboardReferenceCatalog(): Promise<DashboardReferenceCatalog> {
  return getConfiguredDashboardReferenceCatalogGateway().getDashboardReferenceCatalog();
}

export function getRuntimeReferenceCatalogSnapshot(): DashboardReferenceCatalog {
  return runtimeReferenceCatalogSnapshot;
}

export function isRuntimeReferenceCatalogInitialized(): boolean {
  return runtimeReferenceCatalogInitialized;
}

export function initializeRuntimeReferenceCatalogSnapshot(catalog: DashboardReferenceCatalog): void {
  runtimeReferenceCatalogSnapshot = catalog;
  runtimeReferenceCatalogInitialized = true;
}

export function createDashboardReferenceCatalogRepository(
  gateway: DashboardReferenceCatalogGateway = getConfiguredDashboardReferenceCatalogGateway()
): DashboardReferenceCatalogRepository {
  return {
    getCachedDashboardReferenceCatalog() {
      return getRuntimeReferenceCatalogSnapshot();
    },
    async getDashboardReferenceCatalog() {
      return this.refreshDashboardReferenceCatalog();
    },
    async refreshDashboardReferenceCatalog() {
      const catalog = await gateway.getDashboardReferenceCatalog();
      initializeRuntimeReferenceCatalogSnapshot(catalog);
      return catalog;
    }
  };
}

export async function refreshRuntimeReferenceCatalog(
  repository: DashboardReferenceCatalogRepository = createDashboardReferenceCatalogRepository()
): Promise<DashboardReferenceCatalog> {
  return repository.refreshDashboardReferenceCatalog();
}
