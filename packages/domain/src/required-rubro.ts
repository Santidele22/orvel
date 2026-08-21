// @orvel/domain — RequiredRubro
//
// Extracted from apps/dashboard/src/app/features/onboarding/data-access/onboarding-rubros.ts
// (chore-extract-domain-package, D3 split). The runtime REQUIRED_RUBROS constant stays in
// the dashboard: it derives from the runtime reference-catalog gateway snapshot
// (getRuntimeReferenceCatalogSnapshot()), which is app-internal.
//
// The dashboard source declares `export type RequiredRubro = (typeof REQUIRED_RUBROS)[number];`
// where REQUIRED_RUBROS is a `string[]` of catalog business-type codes mapped toLowerCase().
// Extracted dependency-free, the type widens to `string` — the exact type-level surface the
// dashboard had (the source's runtime derivation also widened to `string`).
//
// Keeping it loose lets the canonical catalog evolve at runtime: new business types added via
// the onboarding catalog are covered without a package bump (same escape hatch the old
// `(string & {})` union in @orvel/auth provided).
export type RequiredRubro = string;
