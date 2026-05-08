import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(relativePath: string): string {
  const absolutePath = resolve(process.cwd(), relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : '';
}

describe('KB-012 RED - booking persistence must sync Turnos + Home source of truth', () => {
  it('Turnos list contract: must include an explicit post-booking refresh path from source of truth', () => {
    const turnosListSource = readSource('src/app/pages/dashboard/turnos/turnos-list.page.ts');

    // Existing behavior only hydrates once in ngOnInit; this contract requires a dedicated refresh hook
    // for bookings created outside admin screen (public flow).
    expect(turnosListSource).toMatch(/(booking\.created|onBookingCreated|refreshTurnosFromSource)/i);
    expect(turnosListSource).toMatch(/turnoService\.getAll\(\)\.toPromise\(\)/);
  });

  it('Date filter contract: same-day bookings must compare normalized local date keys (no UTC drift)', () => {
    const turnoServiceSource = readSource('src/app/services/turno.service.ts');

    // Contract: filtering APIs should reuse timezone-safe date-key helper, not toISOString split
    // which can hide valid same-day records in UTC boundary scenarios.
    expect(turnoServiceSource).toMatch(/getByFecha\([\s\S]*this\.toDateKey\(/);
    expect(turnoServiceSource).toMatch(/getHoy\([\s\S]*this\.toDateKey\(/);
    expect(turnoServiceSource).not.toMatch(/getByFecha\([\s\S]*toISOString\(\)\.split\('T'\)\[0\]/);
    expect(turnoServiceSource).not.toMatch(/getHoy\([\s\S]*toISOString\(\)\.split\('T'\)\[0\]/);
  });

  it('Home summary contract: successful public booking must trigger dashboard summary refresh', () => {
    const publicBookingSource = readSource('src/app/pages/booking/public-booking.page.ts');

    // Contract: once booking is confirmed, app must emit/trigger a data refresh signal consumed by Home dashboard.
    expect(publicBookingSource).toMatch(/response\.data\?\.status\s*===\s*'confirmed'/);
    expect(publicBookingSource).toMatch(/dashboardService\.refreshData\(|refreshSummaryPeriod\(|booking\.created|dispatchEvent\(new CustomEvent\(['"]booking\.created['"]\)/i);
  });
});
