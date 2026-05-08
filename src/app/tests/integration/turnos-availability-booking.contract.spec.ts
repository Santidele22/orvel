import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TurnoService } from '../../services/turno.service';
import type { CreateTurnoDTO } from '../../models/turno.model';

function readTurnoFormSource(): string {
  const tsPath = resolve(process.cwd(), 'src/app/pages/dashboard/turnos/turno-form.page.ts');
  const htmlPath = resolve(process.cwd(), 'src/app/pages/dashboard/turnos/turno-form.page.html');
  return `${readFileSync(tsPath, 'utf-8')}\n${readFileSync(htmlPath, 'utf-8')}`;
}

describe('Turnos + Availability integration RED contract (mock mode)', () => {
  it('blocks booking when requested slot is unavailable', async () => {
    // TODO(Aurora): create() debe rechazar slots bloqueados por disponibilidad core en modo mock
    const service = new TurnoService();
    await service.getAll().toPromise();

    const blockedStart = '10:00'; // ocupado por mocks base del día
    const dto: CreateTurnoDTO = {
      clienteId: 'cliente-qa-001',
      servicioId: 'servicio-qa-001',
      fecha: new Date(),
      hora: blockedStart,
      duracionMinutos: 30,
      estado: 'confirmado',
      precio: 2500
    };

    await expect(service.create(dto).toPromise()).rejects.toThrow(/ocupado|no disponible|conflict/i);
  });

  it('allows booking when requested slot is available', async () => {
    const service = new TurnoService();
    await service.getAll().toPromise();

    const availableSlots = service.getHorariosDisponibles(new Date(), 30);
    const target = availableSlots[0];

    const dto: CreateTurnoDTO = {
      clienteId: 'cliente-qa-002',
      servicioId: 'servicio-qa-002',
      fecha: new Date(),
      hora: target,
      duracionMinutos: 30,
      estado: 'confirmado',
      precio: 3000
    };

    const booked = await service.create(dto).toPromise();

    expect(booked).toBeDefined();
    expect(booked?.hora).toBe(target);
    expect(service.items().some(t => t.id === booked?.id)).toBe(true);
  });

  it('exposes informative blocked-slot feedback in UI contract', () => {
    // TODO(Aurora): agregar feedback accesible con data-testid + aria-live al conflicto de slot
    const source = readTurnoFormSource();

    expect(source).toMatch(/conflictError/);
    expect(source).toMatch(/(ya est[aá] ocupado|no disponible|bloqueado)/i);
    expect(source).toMatch(/data-testid=["']turno-slot-blocked-feedback["']/i);
    expect(source).toMatch(/aria-live=["']polite["']/i);
  });
});
