import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockNotificationService } from '../../services/notification.service';

describe('MockNotificationService RED contract (email-only MVP)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T11:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits deterministic admin email payload for new booking event', () => {
    // TODO(Aurora): implementar NotificationService mock con payload determinista para booking.created
    const service = new MockNotificationService();

    const result = service.emit({
      eventKey: 'booking.created:turno-qa-001',
      eventType: 'booking.created',
      channel: 'email',
      recipientRole: 'admin',
      appointmentId: 'turno-qa-001',
      occurredAt: '2026-04-20T10:59:30.000Z'
    });

    expect(result.status).toBe('sent');
    expect(result.payload).toEqual({
      eventKey: 'booking.created:turno-qa-001',
      eventType: 'booking.created',
      channel: 'email',
      recipientRole: 'admin',
      appointmentId: 'turno-qa-001',
      occurredAt: '2026-04-20T10:59:30.000Z',
      emittedAt: '2026-04-20T11:00:00.000Z'
    });
  });

  it('routes cancellation events to client email channel for both actor roles', () => {
    // TODO(Aurora): soportar cancelación por cliente/admin siempre notificando a recipientRole=client
    const service = new MockNotificationService();

    const cancelledByClient = service.emit({
      eventKey: 'booking.cancelled:client:turno-qa-010',
      eventType: 'booking.cancelled',
      channel: 'email',
      recipientRole: 'client',
      sourceRole: 'client',
      appointmentId: 'turno-qa-010',
      occurredAt: '2026-04-20T11:00:00.000Z'
    });

    const cancelledByAdmin = service.emit({
      eventKey: 'booking.cancelled:admin:turno-qa-011',
      eventType: 'booking.cancelled',
      channel: 'email',
      recipientRole: 'client',
      sourceRole: 'admin',
      appointmentId: 'turno-qa-011',
      occurredAt: '2026-04-20T11:00:00.000Z'
    });

    expect(cancelledByClient.payload).toMatchObject({
      eventType: 'booking.cancelled',
      recipientRole: 'client',
      sourceRole: 'client',
      channel: 'email',
      appointmentId: 'turno-qa-010'
    });

    expect(cancelledByAdmin.payload).toMatchObject({
      eventType: 'booking.cancelled',
      recipientRole: 'client',
      sourceRole: 'admin',
      channel: 'email',
      appointmentId: 'turno-qa-011'
    });
  });

  it('prevents duplicate notification emission for repeated event key', () => {
    // TODO(Aurora): implementar idempotencia básica por eventKey en modo mock
    const service = new MockNotificationService();

    const first = service.emit({
      eventKey: 'booking.created:turno-dup-001',
      eventType: 'booking.created',
      channel: 'email',
      recipientRole: 'admin',
      appointmentId: 'turno-dup-001',
      occurredAt: '2026-04-20T11:00:00.000Z'
    });

    const duplicated = service.emit({
      eventKey: 'booking.created:turno-dup-001',
      eventType: 'booking.created',
      channel: 'email',
      recipientRole: 'admin',
      appointmentId: 'turno-dup-001',
      occurredAt: '2026-04-20T11:00:00.000Z'
    });

    expect(first.status).toBe('sent');
    expect(duplicated.status).toBe('duplicate_ignored');
    expect(service.getRecentLog()).toHaveLength(1);
  });

  it('exposes deterministic audit accessor for recent notification log', () => {
    // TODO(Aurora): exponer accessor de auditoría estable para tests/admin observability
    const service = new MockNotificationService();

    service.emit({
      eventKey: 'booking.created:turno-audit-001',
      eventType: 'booking.created',
      channel: 'email',
      recipientRole: 'admin',
      appointmentId: 'turno-audit-001',
      occurredAt: '2026-04-20T10:58:00.000Z'
    });

    service.emit({
      eventKey: 'booking.cancelled:admin:turno-audit-002',
      eventType: 'booking.cancelled',
      channel: 'email',
      recipientRole: 'client',
      sourceRole: 'admin',
      appointmentId: 'turno-audit-002',
      occurredAt: '2026-04-20T10:59:00.000Z'
    });

    const recent = service.getRecentLog();
    expect(recent.map(item => item.payload.appointmentId)).toEqual(['turno-audit-002', 'turno-audit-001']);
    expect(recent.every(item => item.payload.channel === 'email')).toBe(true);
  });
});
