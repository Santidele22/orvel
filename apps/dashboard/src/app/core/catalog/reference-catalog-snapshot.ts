import type { DashboardReferenceCatalog } from './reference-catalog';
import { getRuntimeReferenceCatalogSnapshot } from './reference-catalog.gateway';

/**
 * Reference catalog snapshot frozen at module load.
 *
 * `initializeRuntimeReferenceCatalogSnapshot` swaps the gateway snapshot once
 * the remote catalog resolves, but code that derives module-level data
 * (onboarding defaults, allowed-type lists) needs a stable object. Core and
 * features read this single constant so both layers always agree on one catalog.
 */
export const REFERENCE_CATALOG: DashboardReferenceCatalog = getRuntimeReferenceCatalogSnapshot();
