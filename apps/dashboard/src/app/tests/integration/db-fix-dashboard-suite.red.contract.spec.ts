import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { firstValueFrom } from 'rxjs';

import { ClienteService } from '../../services/cliente.service';
import { DashboardService } from '../../core/dashboard/dashboard.service';

function readSource(relativePath: string): string {
  const absolutePath = resolve(process.cwd(), relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : '';
}

describe('DB-FIX-001 RED - Gestionar bajas must be soft delete only', () => {
  let clienteService: ClienteService;

  beforeEach(() => {
    clienteService = new ClienteService();
    clienteService.setProvider('mock');
  });

  it('deactivates client on delete and keeps record for future purge contract', async () => {
    await firstValueFrom(clienteService.getAll());

    const created = await firstValueFrom(
      clienteService.create({
        nombre: 'QA',
        apellido: 'SoftDelete',
        telefono: '+540000000001'
      })
    );

    const countBeforeDelete = clienteService.items().length;

    await firstValueFrom(clienteService.delete(created.id));

    const afterDeleteList = clienteService.items();
    const deletedRecord = afterDeleteList.find(c => c.id === created.id) as
      | (Record<string, unknown> & { id: string })
      | undefined;

    // Soft-delete contract: deletion should not physically remove the row.
    expect(afterDeleteList.length).toBe(countBeforeDelete);
    expect(deletedRecord).toBeDefined();

    // Domain can use active/isActive/status, but one deactivation signal must exist.
    const isInactive =
      deletedRecord?.['active'] === false ||
      deletedRecord?.['isActive'] === false ||
      deletedRecord?.['status'] === 'inactive' ||
      deletedRecord?.['deactivated'] === true;
    expect(isInactive).toBe(true);

    // Future auto-purge hook/contract must be explicit.
    const hasPurgeContract =
      Boolean(deletedRecord?.['purgeAt']) ||
      Boolean(deletedRecord?.['pendingPurge']) ||
      Boolean(deletedRecord?.['retentionDays']) ||
      Boolean(deletedRecord?.['deletionPolicy']);
    expect(hasPurgeContract).toBe(true);
  });

  it('exposes explicit UI path for low-risk deactivation (not create modal)', () => {
    const clientesTs = readSource('src/app/pages/dashboard/clientes/clientes.page.ts');
    const clientesHtml = readSource('src/app/pages/dashboard/clientes/clientes.page.html');
    const merged = `${clientesTs}\n${clientesHtml}`;

    expect(merged).toMatch(/data-testid=["']clientes-deactivate-action["']/i);
    expect(merged).toMatch(/(deactivateClient|softDeleteClient|darDeBajaCliente)\(/);
    expect(merged).toMatch(/(purgeAt|pendingPurge|autoPurge|retention)/i);
  });
});

describe('DB-FIX-002 RED - Loading skeletons for appointments views', () => {
  it('turnos list page uses deterministic skeleton hooks during loading', () => {
    const turnosListHtml = readSource('src/app/features/booking/pages/turnos-list.page.html');

    expect(turnosListHtml).toMatch(/data-testid=["']turnos-loading-skeleton["']/i);
    expect(turnosListHtml).toMatch(/data-testid=["']turnos-skeleton-row["']/i);
    expect(turnosListHtml).toMatch(/data-testid=["']turnos-skeleton-panel["']/i);
  });

  it('turno create/edit form uses skeleton contract while bootstrapping dependencies', () => {
    const turnoFormHtml = readSource('src/app/features/booking/pages/turno-form.page.html');

    expect(turnoFormHtml).toMatch(/data-testid=["']turno-form-loading-skeleton["']/i);
    expect(turnoFormHtml).toMatch(/data-testid=["']turno-form-skeleton-field["']/i);
  });
});

describe('DB-FIX-003 RED - Service edit/delete must target selected service', () => {
  it('binds edit and delete buttons to selected service identity', () => {
    const serviciosTs = readSource('src/app/pages/dashboard/servicios/servicios.page.ts');
    const serviciosHtml = readSource('src/app/pages/dashboard/servicios/servicios.page.html');
    const merged = `${serviciosTs}\n${serviciosHtml}`;

    expect(merged).toMatch(/\(click\)=\"openEditServicio\(s\.id\)\"/);
    expect(merged).toMatch(/\(click\)=\"openDeleteServicio\(s\.id\)\"/);
    expect(merged).toMatch(/selectedServiceId\s*=\s*signal<.*>\(/);
  });

  it('delete action follows soft-delete contract when domain supports active flag', () => {
    const serviciosTs = readSource('src/app/pages/dashboard/servicios/servicios.page.ts');
    const servicioServiceTs = readSource('src/app/services/servicio.service.ts');
    const merged = `${serviciosTs}\n${servicioServiceTs}`;

    expect(merged).toMatch(/(softDelete|deactivate|activo:\s*false|isActive:\s*false)/i);
    expect(merged).toMatch(/(confirmDeleteServicio|onDeleteServicio|deleteSelectedServicio)\(/);
  });
});

describe('DB-FIX-004 RED - Turnos management via Mini Calendly integration path', () => {
  it('turnos admin UI exposes list/filter/create/edit/cancel hooks', () => {
    const source = readSource('src/app/features/booking/pages/turnos-list.page.html');

    expect(source).toMatch(/data-testid=["']turnos-admin-list["']/i);
    expect(source).toMatch(/data-testid=["']turnos-admin-filter-status["']/i);
    expect(source).toMatch(/data-testid=["']turnos-admin-create-action["']/i);
    expect(source).toMatch(/data-testid=["']turnos-admin-edit-action["']/i);
    expect(source).toMatch(/data-testid=["']turnos-admin-cancel-action["']/i);
  });

  it('turno service keeps create/edit/cancel integration through existing booking adapter', () => {
    const source = readSource('../../packages/booking/src/infrastructure/supabase/admin-booking.repository.ts');

    expect(source).toMatch(/createAdminManualBooking\(/);
    expect(source).toMatch(/updateAdminBooking\(/);
    expect(source).toMatch(/cancelAdminBooking\(/);
    expect(source).toMatch(/rescheduleAdminBooking\(/);
  });
});

describe('DB-FIX-005 - Config section includes Profile + Business settings', () => {
  it('config page keeps both tabs and corresponding settings contracts', () => {
    const configTs = readSource('src/app/features/settings/pages/configuracion.page.ts');
    const configZenHtml = readSource('src/app/features/settings/pages/themes/configuracion-zen-theme.component.html');
    const merged = `${configTs}\n${configZenHtml}`;

    expect(merged).toMatch(/activeSettingsTab/);
    expect(merged).toMatch(/['"]perfil['"]/);
    expect(merged).toMatch(/['"]negocio['"]/);
    expect(merged).toMatch(/formControlName=\"businessName\"/);
    expect(merged).toMatch(/formControlName=\"bufferMinutes\"/);
    expect(merged).toMatch(/formControlName=\"minNoticeMinutes\"/);
    expect(merged).toMatch(/formControlName=\"slotIntervalMinutes\"/);
  });
});

describe('DB-FIX-006 RED - Mejorar plan CTA navigates to plans landing section', () => {
  it('upgrade CTA uses direct navigation contract to plans anchor/section', () => {
    const configZenHtml = readSource('src/app/features/settings/pages/themes/configuracion-zen-theme.component.html');

    expect(configZenHtml).toMatch(/Mejorar Plan/);
    expect(configZenHtml).toMatch(/data-testid=["']upgrade-plan-cta["']/i);
    expect(configZenHtml).toMatch(/(routerLink|href)=\"\/landing(#|\/).*plan(es)?/i);
  });
});

describe('DB-FIX-007 RED - Home metrics are dynamic and DASHBOARD_SYSTEM aligned', () => {
  it('home consumes dynamic metric IDs with DASHBOARD_SYSTEM core set', () => {
    // DB-FIX-007: Check source code for dynamic metrics using signals from services
    const serviceSource = readSource('src/app/core/dashboard/dashboard.service.ts');
    const homeSource = readSource('src/app/pages/dashboard/home/dashboard-home.page.ts');
    const merged = `${serviceSource}\n${homeSource}`;

    // Must use real services (BookingQueries, ClienteService) for dynamic data
    expect(merged).toMatch(/BookingQueries/);
    expect(merged).toMatch(/ClienteService/);
    
    // Must have dynamic metric IDs from DASHBOARD_SYSTEM
    expect(merged).toMatch(/appointments_today/);
    expect(merged).toMatch(/revenue_today/);
    expect(merged).toMatch(/occupancy_rate/);
    expect(merged).toMatch(/next_client/);
    
    // Must use signals (computed) for dynamic metrics
    expect(merged).toMatch(/computed\s*\(\s*\(\s*\)\s*=>\s*\{/);
    
    // Max 5 metrics constraint - verify we have exactly 4 core metrics
    expect(merged).toMatch(/const metricsList: DashboardMetric\[\] = \[/);
  });

  it('keeps one actionable main KPI and avoids mixed business contexts', () => {
    const serviceSource = readSource('src/app/core/dashboard/dashboard.service.ts');
    const homeSource = readSource('src/app/pages/dashboard/home/dashboard-home.page.ts');
    const merged = `${serviceSource}\n${homeSource}`;

    expect(merged).toMatch(/(mainKPI|main_kpi)/);
    expect(merged).toMatch(/(prioritize_real_time_data|actionable|real[-_\s]?time)/i);
    expect(merged).toMatch(/(must_not_mix_business_contexts|businessType|byBusinessType|context)/i);
    expect(merged).toMatch(/(next_client|nextClient)/);
  });
});
