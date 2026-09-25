import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = resolve(process.cwd(), 'src/app');
const REPO_ROOT = resolve(process.cwd(), '../..');

function source(relativePath: string): string {
  return readFileSync(resolve(APP_ROOT, relativePath), 'utf8');
}

function repoSource(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');
}

describe('mutation error log call-site wiring', () => {
  it('wires listed operator and public mutation paths through logMutationFailure', () => {
    const turnoForm = source('features/booking/pages/turno-form.page.ts');
    const turnosList = source('features/booking/pages/turnos-list.page.ts');
    const clientes = source('features/clientes/pages/clientes.page.ts');
    const configuracion = source('features/settings/pages/configuracion.page.ts');
    const publicErrors = source('features/booking/pages/public/public-booking-error-messages.ts');
    const publicPage = source('features/booking/pages/public/public-booking.page.ts');
    const settingsFacade = source('features/settings/data-access/business-settings.facade.ts');
    const realGateway = repoSource('packages/booking/src/infrastructure/supabase/real-gateway.ts');

    for (const file of [turnoForm, turnosList, clientes, configuracion, publicErrors, realGateway]) {
      expect(file).toMatch(/logMutationFailure/);
    }

    expect(turnoForm).toMatch(/create_admin_manual_booking/);
    expect(turnoForm).toMatch(/reschedule_admin_booking/);
    expect(turnoForm).toMatch(/query_admin_slot_availability/);
    expect(turnosList).toMatch(/reschedule_admin_booking/);
    expect(turnosList).toMatch(/cancel_admin_booking/);
    expect(clientes).toMatch(/customers\.insert/);
    expect(clientes).toMatch(/customers\.update/);
    expect(clientes).toMatch(/customers\.deactivate/);
    expect(configuracion).toMatch(/business_settings\.update/);
    expect(settingsFacade).toMatch(/logMutationFailure/);
    expect(settingsFacade).toMatch(/business_settings\.update/);
    expect(publicErrors).toMatch(/create_public_booking/);
    expect(publicPage).toMatch(/query_public_slot_availability|logMutationFailure/);
    expect(realGateway).toMatch(/query_public_slot_availability/);
    expect(realGateway).toMatch(/create_public_booking/);
  });
});
