import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function source(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Contract: MVP landing pricing catalog', () => {
  it('ships only Free and Premium pricing cards in the static fallback', () => {
    const plans = source('src/lib/plans.ts');

    expect(plans).toContain("const CANONICAL_PLAN_ORDER = ['FREE', 'PREMIUM']");
    expect(plans).toContain("code: 'PREMIUM'");
    expect(plans).toContain('price: 9000');
    expect(plans).not.toMatch(/code:\s*['"](?:STARTER|GROWTH|PRO)['"]/);
  });

  it('does not advertise legacy paid tiers, multi-sucursal, or professional-count promises', () => {
    const activePricingSources = [
      source('src/components/molecules/PlanCard.astro'),
      source('src/components/organisms/Pricing.astro'),
      source('src/components/organisms/FAQ.astro')
    ].join('\n');

    expect(activePricingSources).toMatch(/Premium/i);
    expect(activePricingSources).toMatch(/Turnos ilimitados/i);
    expect(activePricingSources).not.toMatch(/\bStarter\b|\bGrowth\b|\bPro\b|multi-sucursal|varias agendas|profesionales\/agendas/i);
  });

  it('keeps the legacy subscription page on the MVP Free/Premium model', () => {
    const subscriptionPage = source('src/pages/billing/subscription.astro');

    expect(subscriptionPage).toContain('PREMIUM');
    expect(subscriptionPage).toContain('$9.000/mes');
    expect(subscriptionPage).toContain('orvel.pagos');
    expect(subscriptionPage).not.toMatch(/Hasta 15 turnos/i);
    expect(subscriptionPage).not.toMatch(/\$12\s*\/\s*mes|\$22\s*\/\s*mes|\$39\s*\/\s*mes/);
    expect(subscriptionPage).not.toMatch(/quarterly|annual/);
  });

  it('moves both catalog price surfaces to ARS 9.000 in one migration', () => {
    const migration = source(
      '../../supabase/migrations/20260928120000_premium_monthly_price_9000.sql'
    );

    // public.plans.price — major units, read by get_active_plans().
    expect(migration).toMatch(/price = 9000/);
    // public.plan_prices.amount_cents — minor units, read by the billing surfaces.
    expect(migration).toMatch(/amount_cents = 900000/);

    expect(migration).toMatch(/WHERE code = 'PREMIUM'/);
    expect(migration).toMatch(/WHERE plan_code = 'PREMIUM'/);

    // Mercado Pago is not integrated; the legacy catalog must stay untouched.
    expect(migration).not.toMatch(/UPDATE\s+public\.mp_plan_catalog/i);
    expect(migration).not.toMatch(/mp_plan_catalog\s*\n?\s*SET/i);
  });

  it('keeps the Premium monthly price at ARS 9.000 on every shipped surface', () => {
    expect(source('src/lib/plans.ts')).toContain('price: 9000');
    expect(source('src/pages/index.astro')).toContain("'$9.000'");
    expect(source('src/lib/premium-alias-receipt.ts')).toContain("PREMIUM_PRICE_COPY = '$9.000'");
    expect(source('src/pages/billing/subscription.astro')).toContain('$9.000/mes');

    expect(
      source('../dashboard/src/app/features/billing/data-access/landing-plans-source.api.ts')
    ).toContain('priceMonthlyCents: 900_000');
    expect(source('../dashboard/src/app/core/billing/premium-alias-receipt.ts')).toContain(
      "PREMIUM_PRICE_COPY = '$9.000'"
    );
    expect(
      source('../dashboard/src/app/features/billing/pages/billing-subscription.page.html')
    ).toContain('$9.000/mes');
    expect(
      source('../dashboard/src/app/features/auth/pages/in-app-signup-wizard.page.ts')
    ).toContain('$9.000/mes');
  });

  it('leaves no ARS 25.000 Premium price behind on a shipped surface', () => {
    const shippedSurfaces = [
      'src/lib/plans.ts',
      'src/pages/index.astro',
      'src/pages/billing/subscription.astro',
      'src/lib/premium-alias-receipt.ts',
      '../dashboard/src/app/core/billing/premium-alias-receipt.ts',
      '../dashboard/src/app/features/billing/data-access/landing-plans-source.api.ts',
      '../dashboard/src/app/features/billing/pages/billing-subscription.page.html',
      '../dashboard/src/app/features/auth/pages/in-app-signup-wizard.page.ts'
    ];

    for (const surface of shippedSurfaces) {
      expect(source(surface), `${surface} still ships the old Premium price`).not.toMatch(
        /25\.000|25000|2_500_000/
      );
    }
  });
});
