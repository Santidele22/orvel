import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { BusinessService } from '../../features/settings/data-access/business.service';
import { createMockTurnoService } from '../helpers/turno-service-testbed';

function createBusinessService(): BusinessService {
  const injector = Injector.create({
    providers: [{ provide: AuthService, useValue: { user: () => ({ id: 'qa-user-001' }) } }]
  });

  return runInInjectionContext(injector, () => new BusinessService());
}

describe('Mock business settings -> availability deterministic contract', () => {
  it('computes slots deterministically from business config', async () => {
    // TODO(Aurora): integrar BusinessService con disponibilidad de turnos (modo mock, sin Supabase)
    const turnoService = createMockTurnoService() as any;
    const settingsFacade = createBusinessService();

    await turnoService.getAll().toPromise();

    const baseHours = settingsFacade.getDefaultWorkingHours();
    const mondayHours = { monday: baseHours.monday };

    const configA = {
      bufferMinutes: 0,
      minNoticeMinutes: 0,
      slotIntervalMinutes: 30,
      workingHours: mondayHours
    };

    expect(typeof turnoService.getHorariosDisponiblesConConfiguracion).toBe('function');

    const first = turnoService.getHorariosDisponiblesConConfiguracion(
      new Date('2026-04-20T00:00:00'),
      30,
      configA
    );
    const second = turnoService.getHorariosDisponiblesConConfiguracion(
      new Date('2026-04-20T00:00:00'),
      30,
      configA
    );

    expect(second).toEqual(first);
  });

  it('changes output predictably when interval, buffer and notice settings change', async () => {
    const turnoService = createMockTurnoService() as any;
    const settingsFacade = createBusinessService();
    await turnoService.getAll().toPromise();

    const dayHours = { monday: settingsFacade.getDefaultWorkingHours().monday };

    const coarse = turnoService.getHorariosDisponiblesConConfiguracion(
      new Date('2026-04-20T00:00:00'),
      30,
      {
        bufferMinutes: 0,
        minNoticeMinutes: 0,
        slotIntervalMinutes: 30,
        workingHours: dayHours
      }
    );

    const fine = turnoService.getHorariosDisponiblesConConfiguracion(
      new Date('2026-04-20T00:00:00'),
      30,
      {
        bufferMinutes: 0,
        minNoticeMinutes: 0,
        slotIntervalMinutes: 15,
        workingHours: dayHours
      }
    );

    const constrained = turnoService.getHorariosDisponiblesConConfiguracion(
      new Date('2026-04-20T00:00:00'),
      30,
      {
        bufferMinutes: 15,
        minNoticeMinutes: 60,
        slotIntervalMinutes: 15,
        workingHours: dayHours
      }
    );

    expect(fine.length).toBeGreaterThan(coarse.length);
    expect(constrained.length).toBeLessThanOrEqual(fine.length);
  });
});
