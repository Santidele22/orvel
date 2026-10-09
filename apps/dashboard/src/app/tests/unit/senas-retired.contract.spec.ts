// Guard: the seña (manual alias/CBU deposit) is retired from the product.
//
// The database keeps the objects, the operator configuration and the booking
// history (see supabase/migrations/20261008120000_retire_deposits.sql), but no
// dashboard surface may offer, require, show or configure a seña again. This
// test fails if any booking surface brings the vocabulary back.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const F = '../../features/';

const files: Record<string, string> = {
  publicBookingPage: `${F}booking/pages/public/public-booking.page.html`,
  publicBookingPageTs: `${F}booking/pages/public/public-booking.page.ts`,
  turnosList: `${F}booking/pages/turnos-list.page.html`,
  turnosListTs: `${F}booking/pages/turnos-list.page.ts`,
  appointmentCard: `${F}booking/ui/mobile-appointment-card/mobile-appointment-card.component.html`,
  appointmentCardTs: `${F}booking/ui/mobile-appointment-card/mobile-appointment-card.component.ts`,
  turnoDetail: `${F}booking/ui/mobile-turno-detail/mobile-turno-detail.component.html`,
  turnoDetailTs: `${F}booking/ui/mobile-turno-detail/mobile-turno-detail.component.ts`,
  dashboardHome: `${F}dashboard-home/pages/dashboard-home.page.html`,
  dashboardHomeTs: `${F}dashboard-home/pages/dashboard-home.page.ts`,
  zenSettings: `${F}settings/pages/themes/configuracion-zen-theme.component.html`,
  settingsPage: `${F}settings/pages/configuracion.page.ts`,
  operatorTour: `${F}operator-tour/operator-tour-steps.ts`,
};

const sources: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, readFileSync(new URL(path, import.meta.url), 'utf8')]),
);

// "contraseña" legitimately contains "seña" and has nothing to do with the
// retired deposit feature, so the password wording is neutralised first.
const withoutPasswordCopy = (source: string): string => source.replace(/contraseñas?/gi, '');

describe('Contract: the seña is retired from the dashboard', () => {
  it('ships no seña copy and no deposit field on any booking or settings surface', () => {
    for (const [key, source] of Object.entries(sources)) {
      expect(withoutPasswordCopy(source), `${key} must not mention the seña`).not.toMatch(/deposit|\bse[nñ]as?\b/i);
    }
  });

  it('keeps the legacy deposit status only in the data layer, out of the UI wiring', () => {
    expect(sources['turnosListTs']).not.toMatch(/isDepositUnpaid|appointmentStatusLabel/);
    expect(sources['appointmentCardTs']).not.toMatch(/isDepositUnpaid/);
    expect(sources['turnoDetailTs']).not.toMatch(/isDepositUnpaid/);
    expect(sources['dashboardHomeTs']).not.toMatch(/depositPending|confirmDepositReceived/);
    expect(sources['publicBookingPageTs']).not.toMatch(/public-booking-deposit-hold/);
  });
});
