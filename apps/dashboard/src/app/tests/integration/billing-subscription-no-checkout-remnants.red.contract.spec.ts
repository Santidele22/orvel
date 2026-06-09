import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function findRepoRoot(startDir: string): string {
  let current = startDir;

  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'apps')) && fs.existsSync(path.join(current, 'supabase'))) {
      return current;
    }

    current = path.dirname(current);
  }

  throw new Error(`Unable to find Orvel repo root from ${startDir}`);
}

const TEST_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = findRepoRoot(TEST_DIR);

function readRequired(relativePath: string): string {
  const absolutePath = path.join(ROOT, relativePath);

  expect(fs.existsSync(absolutePath), `Missing file: ${relativePath}`).toBe(true);
  return fs.readFileSync(absolutePath, 'utf8');
}

function readOptional(relativePath: string): string | null {
  const absolutePath = path.join(ROOT, relativePath);

  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : null;
}

describe('RED contract: Orvel billing uses MercadoPago subscriptions/preapproval, not checkout', () => {
  it('removes the dead dashboard checkout-intents API from core payments', () => {
    const checkoutIntentsApi = path.join(
      ROOT,
      'apps/dashboard/src/app/core/payments/checkout-intents/checkout-intents.api.ts'
    );

    expect(
      fs.existsSync(checkoutIntentsApi),
      'checkout-intents was a dead Checkout Pro remnant; canonical billing must use subscriptions/preapproval APIs instead.'
    ).toBe(false);
  });

  it('stops obsolete MercadoPago checkout/preference tests from asserting billing source-of-truth contracts', () => {
    const obsoleteContracts = [
      'apps/dashboard/src/app/tests/integration/payments-checkout-intents-mercadopago.red.contract.spec.ts',
      'apps/dashboard/src/app/tests/integration/kb009-mercadopago-integration-guard.red.contract.spec.ts'
    ];

    for (const relativePath of obsoleteContracts) {
      const source = readOptional(relativePath);

      if (!source) {
        continue;
      }

      expect(source, `${relativePath} must not keep checkout-intent or Checkout Pro preference as billing truth`).not.toMatch(
        /createCheckoutIntent|payment_checkout_intents|checkoutIntentId|checkoutUrl|Checkout preference creation|preferenceId/i
      );
    }
  });

  it('uses subscription-oriented dashboard routes and NextRoute names for pending paid-plan billing', () => {
    const onboardingFlow = readRequired('apps/dashboard/src/app/features/onboarding/data-access/landing-dashboard-onboarding-wiring.flow.ts');
    const onboardingPersistence = readRequired('apps/dashboard/src/app/features/onboarding/data-access/onboarding-persistence.service.ts');

    const source = `${onboardingFlow}\n${onboardingPersistence}`;

    expect(source).toContain('billing_subscription');
    expect(source).toContain('/billing/subscription');
    expect(source).not.toMatch(/billing_checkout|\/billing\/test-checkout|checkout to activate|Retry checkout/i);
  });

  it('keeps subscription/preapproval API endpoints canonical instead of exposing checkout endpoints', () => {
    const routingSurface = [
      'apps/dashboard/src/app/features/onboarding/data-access/landing-dashboard-onboarding-wiring.flow.ts',
      'apps/dashboard/src/app/features/billing/pages/billing-subscription.page.ts',
      'apps/dashboard/src/app/features/billing/pages/billing-subscription.component.ts',
      'apps/landing/src/pages/billing/subscription.astro',
      'apps/landing/src/pages/api/subscriptions/start.ts',
      'apps/landing/src/pages/api/subscriptions/status.ts'
    ]
      .map((relativePath) => readOptional(relativePath) ?? '')
      .join('\n');

    expect(routingSurface).toMatch(/\/api\/subscriptions\/start|\/functions\/v1\/create-subscription/);
    expect(routingSurface).toMatch(/\/api\/subscriptions\/status|\/billing\/subscription/);
    expect(routingSurface).not.toMatch(/\/api\/checkout|\/billing\/test-checkout|test-checkout|billing-checkout/i);
  });

  it('emits subscription/preapproval session external references from Supabase functions, never new checkout-session references', () => {
    const billingSessionReferenceHelper = readRequired('supabase/functions/_shared/mp-subscription-session-reference.ts');
    const functionsThatCreateMercadoPagoReferences = [
      'supabase/functions/create-subscription/index.ts',
      'supabase/functions/change-subscription/index.ts'
    ];

    for (const relativePath of functionsThatCreateMercadoPagoReferences) {
      const source = `${readRequired(relativePath)}\n${billingSessionReferenceHelper}`;

      expect(source, `${relativePath} must emit canonical subscription/preapproval session references`).toMatch(
        /(subscription|preapproval)-session:/
      );
      expect(source, `${relativePath} must not create new checkout-session external references`).not.toMatch(
        /externalReference\s*=\s*`checkout-session:|external_reference\s*:\s*`checkout-session:/
      );
    }
  });

  it('treats checkout-session only as legacy compatibility in webhook validation, not as canonical messaging/state', () => {
    const webhookSource = `${readRequired('supabase/functions/mercadopago-webhook/index.ts')}\n${readRequired('supabase/functions/_shared/mp-subscription-session-reference.ts')}`;

    expect(webhookSource).toMatch(/subscription-session:|preapproval-session:/);
    expect(webhookSource).not.toMatch(/valid checkout session reference|checkout_session_mismatch|validate_billing_checkout_session/i);
  });
});
