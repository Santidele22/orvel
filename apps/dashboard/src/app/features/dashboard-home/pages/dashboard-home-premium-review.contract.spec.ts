import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import { countCurrentMonthBookings } from '../../../core/billing/premium-alias-receipt';

const COMPONENT_PATH = new URL('./dashboard-home.page.ts', import.meta.url);
const TEMPLATE_PATH = new URL('./dashboard-home.page.html', import.meta.url);

const componentSource = fs.readFileSync(COMPONENT_PATH, 'utf8');
const templateSource = fs.readFileSync(TEMPLATE_PATH, 'utf8');

function mobileSummaryBlock(source: string): string {
  const start = source.indexOf('data-testid="dashboard-home-mobile-summary"');
  return start < 0 ? '' : source.slice(start);
}

describe('Dashboard home Premium review banner', () => {
  it('shows the pending banner and WhatsApp links in the mobile block when review is pending', () => {
    const mobile = mobileSummaryBlock(templateSource);

    expect(mobile).toMatch(/showPremiumReviewBanner\(\s*\)/);
    expect(mobile).toContain('data-testid="premium-review-banner"');
    expect(mobile).toContain('Premium en revisión — seguís en Gratis hasta que validemos el comprobante.');
    expect(mobile).toContain('Ya envié el comprobante');
    expect(mobile).toContain('Volver a WhatsApp');
    expect(mobile).toMatch(/wa\.me\/5492944667161|premiumWhatsAppUrl\(/);
    expect(mobile).toContain('Turnos este mes');
    expect(mobile).toContain('Con Premium vas a tener turnos ilimitados.');
    expect(mobile.indexOf('data-testid="premium-review-banner"')).toBeLessThan(mobile.indexOf('Compartir link de reserva'));
  });

  it('wires pending flag, receipt-sent action, and FREE maxMonthlyBookings of 30', () => {
    expect(componentSource).toMatch(/showPremiumReviewBanner/);
    expect(componentSource).toMatch(/markReceiptSent|markPremiumReceiptSent/);
    expect(componentSource).toMatch(/maxMonthlyBookings/);
    expect(componentSource).toMatch(/orvel\.premium_review|isPremiumReviewPending|PREMIUM_REVIEW_STORAGE_KEY/);
  });

  it('counts current-month bookings from already-loaded agenda rows', () => {
    expect(
      countCurrentMonthBookings(
        [
          { id: 'a', fecha: new Date('2026-08-02T12:00:00.000Z'), estado: 'confirmado' },
          { id: 'b', fecha: new Date('2026-07-31T12:00:00.000Z'), estado: 'confirmado' },
          { id: 'c', fecha: new Date('2026-08-10T12:00:00.000Z'), estado: 'cancelado' },
          { id: 'a', fecha: new Date('2026-08-02T12:00:00.000Z'), estado: 'confirmado' },
        ],
        new Date('2026-08-15T15:00:00.000Z'),
      ),
    ).toBe(1);
  });
});
