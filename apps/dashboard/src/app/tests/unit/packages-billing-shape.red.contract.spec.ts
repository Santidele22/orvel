/**
 * packages-billing-shape.red.contract.spec.ts
 *
 * Drift guard for the @orvel/billing package surface.
 * Per sdd-design D5 + sdd-spec REQ-BILLING-SPEC-1 (chore-extract-billing-package).
 *
 * Asserts:
 * - package.json exports a single canonical entry (types + default → ./src/index.ts).
 * - src/index.ts re-exports the canonical surface (PaymentProvider, BillingEvent,
 *   PaymentRecord, ManualPaymentInput, ManualPaymentService,
 *   buildProviderAgnosticIdempotencyKey, decideWebhookProcessing + WebhookProcessingDecision).
 * - src/payment-provider.ts is import-free pure (no dashboard-internal deps).
 * - src/manual-payment.service.ts and src/payment-webhook-idempotency.ts only
 *   import from the same package (intra-package `./` specifiers only).
 * - The 3 dashboard old paths in core/payments/manual/ are explicit per-name
 *   re-export shims pointing at @orvel/billing (REQ-BILLING-3; no `export *`).
 * - The dashboard webhook idempotency path is a re-export shim (D3).
 * - 2 of the 3 dead re-shims in core/billing/ are absent (REQ-BILLING-DEL-1);
 *   landing-plans-source.api.ts is KEPT (dynamic-import consumer surfaced at apply).
 * - pnpm-workspace.yaml still wires packages/* (REQ-BILLING-2).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..', '..');
const PACKAGE_ROOT = join(REPO_ROOT, 'packages', 'billing');
const PACKAGE_INDEX = join(PACKAGE_ROOT, 'src', 'index.ts');
const PACKAGE_PACKAGE_JSON = join(PACKAGE_ROOT, 'package.json');
const PAYMENT_PROVIDER_SOURCE = join(PACKAGE_ROOT, 'src', 'payment-provider.ts');
const MANUAL_PAYMENT_SERVICE_SOURCE = join(PACKAGE_ROOT, 'src', 'manual-payment.service.ts');
const WEBHOOK_IDEMPOTENCY_SOURCE = join(PACKAGE_ROOT, 'src', 'payment-webhook-idempotency.ts');
const DASHBOARD_MANUAL_DIR = join(REPO_ROOT, 'apps', 'dashboard', 'src', 'app', 'core', 'payments', 'manual');
const DASHBOARD_PAYMENT_PROVIDER_SHIM = join(DASHBOARD_MANUAL_DIR, 'payment-provider.ts');
const DASHBOARD_MANUAL_PAYMENT_SERVICE_SHIM = join(DASHBOARD_MANUAL_DIR, 'manual-payment.service.ts');
const DASHBOARD_MANUAL_INDEX_SHIM = join(DASHBOARD_MANUAL_DIR, 'index.ts');
const DASHBOARD_WEBHOOK_IDEMPOTENCY_SHIM = join(
  REPO_ROOT,
  'apps',
  'dashboard',
  'src',
  'app',
  'features',
  'billing',
  'data-access',
  'payments',
  'webhooks',
  'payment-webhook-idempotency.ts'
);
const DELETED_ENTITLEMENTS_RE_SHIM = join(
  REPO_ROOT,
  'apps',
  'dashboard',
  'src',
  'app',
  'core',
  'billing',
  'subscriptions',
  'entitlements.api.ts'
);
const DELETED_SSM_RE_SHIM = join(
  REPO_ROOT,
  'apps',
  'dashboard',
  'src',
  'app',
  'core',
  'billing',
  'subscriptions',
  'subscription-state-machine.api.ts'
);
const KEPT_LANDING_PLANS_SOURCE_SHIM = join(
  REPO_ROOT,
  'apps',
  'dashboard',
  'src',
  'app',
  'core',
  'billing',
  'landing-plans-source.api.ts'
);

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

describe('@orvel/billing package shape contract (chore-extract-billing-package)', () => {
  it('package.json exports the canonical single entry', () => {
    const packageJson = JSON.parse(readSource(PACKAGE_PACKAGE_JSON));

    expect(packageJson.name).toBe('@orvel/billing');
    expect(packageJson.type).toBe('module');
    expect(packageJson.exports).toBeDefined();
    expect(packageJson.exports['.']).toBeDefined();
    expect(packageJson.exports['.'].types).toBe('./src/index.ts');
    expect(packageJson.exports['.'].default).toBe('./src/index.ts');
    // Single exports."." entry — no subpath (per sdd-design D1)
    expect(Object.keys(packageJson.exports)).toEqual(['.']);
  });

  it('src/index.ts re-exports the canonical surface (7 names + WebhookProcessingDecision)', () => {
    const indexSource = readSource(PACKAGE_INDEX);

    expect(indexSource).toContain('PaymentProvider');
    expect(indexSource).toContain('BillingEvent');
    expect(indexSource).toContain('PaymentRecord');
    expect(indexSource).toContain('ManualPaymentInput');
    expect(indexSource).toContain('ManualPaymentService');
    expect(indexSource).toContain('buildProviderAgnosticIdempotencyKey');
    expect(indexSource).toContain('decideWebhookProcessing');
    // Full public surface of the moved files includes the decision type (REQ-BILLING-1)
    expect(indexSource).toContain('WebhookProcessingDecision');
  });

  it('src/payment-provider.ts is import-free pure (no dashboard-internal deps)', () => {
    const source = readSource(PAYMENT_PROVIDER_SOURCE);

    expect(source, 'payment-provider must not import anything (REQ-BILLING-1)').not.toMatch(/^\s*import\b/m);
    // Core exports present
    expect(source).toContain("export type PaymentProvider = 'manual'");
    expect(source).toContain('export interface BillingEvent');
    expect(source).toContain('export interface PaymentRecord');
    expect(source).toContain('export interface ManualPaymentInput');
  });

  it('src/manual-payment.service.ts only imports from the same package', () => {
    const source = readSource(MANUAL_PAYMENT_SERVICE_SOURCE);

    // Any import must be a same-package relative `./` specifier — never dashboard-internal
    expect(source).not.toMatch(/from\s+['"](?!\.\/)/);
    expect(source, 'no dashboard-internal path segments').not.toMatch(/core\/payments|features\/billing/);
    expect(source).toContain('export class ManualPaymentService');
  });

  it('src/payment-webhook-idempotency.ts only imports from the same package', () => {
    const source = readSource(WEBHOOK_IDEMPOTENCY_SOURCE);

    expect(source).not.toMatch(/from\s+['"](?!\.\/)/);
    expect(source, 'no dashboard-internal path segments').not.toMatch(/core\/payments|features\/billing/);
    expect(source).toContain('export function buildProviderAgnosticIdempotencyKey');
    expect(source).toContain('export function decideWebhookProcessing');
  });

  it('3 dashboard shims in core/payments/manual/ re-export from @orvel/billing (no export *)', () => {
    const paymentProviderShim = readSource(DASHBOARD_PAYMENT_PROVIDER_SHIM);
    const manualPaymentServiceShim = readSource(DASHBOARD_MANUAL_PAYMENT_SERVICE_SHIM);
    const indexShim = readSource(DASHBOARD_MANUAL_INDEX_SHIM);

    for (const shim of [paymentProviderShim, manualPaymentServiceShim, indexShim]) {
      expect(shim).toContain("from '@orvel/billing'");
      expect(shim, 'shims must be explicit per-name re-exports (REQ-BILLING-3)').not.toContain('export *');
    }
    // Per-name coverage of the full surface through the barrel shim
    expect(indexShim).toContain('PaymentProvider');
    expect(indexShim).toContain('ManualPaymentService');
    expect(indexShim).toContain('buildProviderAgnosticIdempotencyKey');
    expect(indexShim).toContain('decideWebhookProcessing');
  });

  it('dashboard webhook idempotency shim re-exports from @orvel/billing (no export *)', () => {
    const shim = readSource(DASHBOARD_WEBHOOK_IDEMPOTENCY_SHIM);

    expect(shim).toContain("from '@orvel/billing'");
    expect(shim).not.toContain('export *');
    expect(shim).toContain('buildProviderAgnosticIdempotencyKey');
    expect(shim).toContain('decideWebhookProcessing');
  });

  it('2 of the 3 dead re-shims in core/billing/ are absent; landing-plans-source.api.ts is kept', () => {
    // REQ-BILLING-DEL-1: zero-importer re-shims removed
    expect(existsSync(DELETED_ENTITLEMENTS_RE_SHIM)).toBe(false);
    expect(existsSync(DELETED_SSM_RE_SHIM)).toBe(false);
    // KEPT at apply: dynamic-import consumer surfaced in
    // tests/integration/landing-orvel-pricing.red.contract.spec.ts (deletion deferred)
    expect(existsSync(KEPT_LANDING_PLANS_SOURCE_SHIM)).toBe(true);
  });

  it('pnpm-workspace.yaml still wires packages/* (REQ-BILLING-2)', () => {
    const workspaceYaml = readSource(join(REPO_ROOT, 'pnpm-workspace.yaml'));

    expect(workspaceYaml).toContain('packages/*');
  });
});
