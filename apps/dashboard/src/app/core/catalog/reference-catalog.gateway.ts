import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '../api/supabase-booking/real-gateway';
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

const CLOSED_RUNTIME_REFERENCE_CATALOG: DashboardReferenceCatalog = {
  plans: [
    {
      code: 'FREE',
      label: 'Unavailable',
      maxLocales: 0,
      maxRubros: 0,
      maxMonthlyBookings: 0,
      aiCreditsMonthly: 0
    }
  ],
  planAliases: [],
  businessTypes: [],
  businessTypeAliases: [],
  planBusinessTypes: []
};

function isTestRuntime(): boolean {
  const processLike = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process;
  return processLike?.env?.['NODE_ENV'] === 'test' || processLike?.env?.['VITEST'] === 'true';
}

let runtimeReferenceCatalogSnapshot: DashboardReferenceCatalog = isTestRuntime()
  ? DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE
  : CLOSED_RUNTIME_REFERENCE_CATALOG;
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
