import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateTurnoDTO } from '../../features/booking/models/turno.model';
import { MockNotificationService } from '../../services/notification.service';
import { createMockTurnoService } from '../helpers/turno-service-testbed';

describe('TurnoService + notifications integration RED contract (mock mode)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits booking-created notification after successful create()', async () => {
    // TODO(Aurora): integrar TurnoService.create() con emisión booking.created en NotificationService mock
    const notificationService = new MockNotificationService();
    const turnoService = createMockTurnoService();

    expect(typeof (turnoService as any).attachNotificationService).toBe('function');
    (turnoService as any).attachNotificationService(notificationService);

    await turnoService.getAll().toPromise();
    const availableSlots = turnoService.getHorariosDisponibles(new Date('2035-04-20T00:00:00.000Z'), 30);

    const dto: CreateTurnoDTO = {
      clienteId: 'cliente-qa-notif-001',
      servicioId: 'servicio-qa-notif-001',
      fecha: new Date('2035-04-20T00:00:00.000Z'),
      hora: availableSlots[0],
      duracionMinutos: 30,
      estado: 'confirmado',
      precio: 3000
    };

    const created = await turnoService.create(dto).toPromise();

    const recent = notificationService.getRecentLog();
    expect(recent).toHaveLength(1);
    expect(recent[0].payload).toMatchObject({
      eventType: 'booking.created',
      recipientRole: 'admin',
      channel: 'email',
      appointmentId: created.id,
      emittedAt: '2026-04-20T12:00:00.000Z'
    });
  });

  it('emits cancellation notification after successful cancelByAdmin()', async () => {
    // TODO(Aurora): integrar cancelByAdmin() con emisión booking.cancelled hacia cliente
    const notificationService = new MockNotificationService();
    const turnoService = createMockTurnoService();

    expect(typeof (turnoService as any).attachNotificationService).toBe('function');
    (turnoService as any).attachNotificationService(notificationService);

    await turnoService.getAll().toPromise();
    await turnoService.cancelByAdmin('turno-002', {
      performedBy: 'admin-qa',
      reason: 'Contract test cancellation'
    }).toPromise();

    const recent = notificationService.getRecentLog();
    expect(recent.length).toBeGreaterThan(0);

    const cancellation = recent.find(item => item.payload.eventType === 'booking.cancelled');
    expect(cancellation?.payload).toMatchObject({
      eventType: 'booking.cancelled',
      recipientRole: 'client',
      sourceRole: 'admin',
      channel: 'email',
      appointmentId: 'turno-002',
      emittedAt: '2026-04-20T12:00:00.000Z'
    });
  });

  it('does not emit notification when booking/cancel operation fails', async () => {
    // TODO(Aurora): asegurar no-emisión de eventos cuando create/cancel rechaza
    const notificationService = new MockNotificationService();
    const turnoService = createMockTurnoService();

    expect(typeof (turnoService as any).attachNotificationService).toBe('function');
    (turnoService as any).attachNotificationService(notificationService);

    await turnoService.getAll().toPromise();

    const blockedCreate: CreateTurnoDTO = {
      clienteId: 'cliente-qa-notif-002',
      servicioId: 'servicio-qa-notif-002',
      fecha: new Date(),
      hora: '10:00', // ocupado por mock base
      duracionMinutos: 30,
      estado: 'confirmado',
      precio: 2800
    };

    await expect(turnoService.create(blockedCreate).toPromise()).rejects.toThrow(/ocupado|no disponible|bloqueado/i);
    await expect(turnoService.cancelByAdmin('turno-not-found', { performedBy: 'admin-qa' }).toPromise()).rejects.toThrow(
      /TURNO_NOT_FOUND/
    );

    expect(notificationService.getRecentLog()).toHaveLength(0);
  });
});
