import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnoService } from '../../services/turno.service';

describe('TurnoService admin management RED contract (mock mode)', () => {
  let service: TurnoService;

  beforeEach(async () => {
    service = new TurnoService();
    await service.getAll().toPromise();

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T10:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancels an appointment by admin and keeps history integrity', async () => {
    // TODO(Aurora): implementar cancelByAdmin con auditoría de transición y razón determinista
    const previous = service.items().find(t => t.id === 'turno-002');
    expect(previous).toBeDefined();

    const updated = await (service as any)
      .cancelByAdmin('turno-002', {
        reason: 'Cierre operativo por mantenimiento',
        performedBy: 'admin-qa'
      })
      .toPromise();

    expect(updated.estado).toBe('cancelado');
    expect(updated.createdAt.toISOString()).toBe(previous!.createdAt.toISOString());
    expect(updated.updatedAt.toISOString()).toBe('2026-04-20T10:30:00.000Z');
    expect(updated.notas ?? '').toMatch(/mantenimiento|admin/i);
  });

  it('reschedules by admin when slot is available', async () => {
    // TODO(Aurora): implementar rescheduleByAdmin validando disponibilidad real antes de persistir
    const targetDate = new Date('2026-04-20T00:00:00.000Z');

    const rescheduled = await (service as any)
      .rescheduleByAdmin('turno-002', {
        fecha: targetDate,
        hora: '12:00',
        performedBy: 'admin-qa'
      })
      .toPromise();

    expect(rescheduled.id).toBe('turno-002');
    expect(rescheduled.hora).toBe('12:00');
    expect(rescheduled.fecha.toISOString().slice(0, 10)).toBe('2026-04-20');
    expect(rescheduled.updatedAt.toISOString()).toBe('2026-04-20T10:30:00.000Z');
  });

  it('blocks admin reschedule when new slot collides with existing appointment', async () => {
    // TODO(Aurora): estandarizar error determinista TURNO_SLOT_COLLISION para colisiones
    const targetDate = new Date('2026-04-20T00:00:00.000Z');

    await expect(
      (service as any)
        .rescheduleByAdmin('turno-002', {
          fecha: targetDate,
          hora: '10:00', // ocupado por turno-001 en mocks
          performedBy: 'admin-qa'
        })
        .toPromise()
    ).rejects.toThrow(/TURNO_SLOT_COLLISION/);
  });

  it('does not expose completeByAdmin in admin v2 (only cancel/reschedule allowed)', async () => {
    // TODO(Aurora): retirar método completeByAdmin del servicio y limpiar referencias legacy.
    expect((service as any).completeByAdmin).toBeUndefined();
  });
});
