import type { AdminBookingRepository, AdminFailureTelemetryInput } from './ports/admin-booking.repository';

export type NotificationEmitPort = {
  emit(input: {
    eventKey: string; eventType: 'booking.created' | 'booking.cancelled' | 'booking.rescheduled';
    channel: 'email'; recipientRole: 'admin' | 'client'; appointmentId: string; occurredAt: string;
    sourceRole?: 'admin' | 'client';
  }): { status: 'sent' | 'duplicate_ignored' };
};

export class BookingNotificationsService {
  private notificationService?: NotificationEmitPort;
  constructor(private readonly adminRepo?: AdminBookingRepository) {}

  attachNotificationService(notificationService: NotificationEmitPort): void {
    this.notificationService = notificationService;
  }

  notifyBookingCreated(appointmentId: string, occurredAt: string): void {
    this.notificationService?.emit({
      eventKey: `booking.created:${appointmentId}`, eventType: 'booking.created', channel: 'email',
      recipientRole: 'admin', appointmentId, occurredAt
    });
  }

  notifyBookingRescheduled(appointmentId: string, occurredAt: string): void {
    this.notificationService?.emit({
      eventKey: `booking.rescheduled:${appointmentId}`, eventType: 'booking.rescheduled', channel: 'email',
      recipientRole: 'client', appointmentId, occurredAt
    });
  }

  notifyBookingCancelled(appointmentId: string, occurredAt: string, sourceRole: 'admin' | 'client' = 'client'): void {
    this.notificationService?.emit({
      eventKey: `booking.cancelled:${sourceRole}:${appointmentId}`, eventType: 'booking.cancelled',
      channel: 'email', recipientRole: 'client', sourceRole, appointmentId, occurredAt
    });
  }

  notifyAdminAction(appointmentId: string, action: 'cancel' | 'reschedule', occurredAt: string): void {
    if (action === 'cancel') this.notifyBookingCancelled(appointmentId, occurredAt, 'admin');
    else this.notifyBookingRescheduled(appointmentId, occurredAt);
  }

  async recordAdminCancelFailureTelemetry(input: AdminFailureTelemetryInput): Promise<void> {
    try {
      await this.adminRepo?.recordCancelFailure({
        stage: input.stage, code: this.sanitizeAdminCancelTelemetryCode(input.code),
        status: this.sanitizeAdminCancelTelemetryStatus(input.status), retryable: input.retryable ?? true
      });
    } catch { /* telemetry must never block cancel UX */ }
  }

  async recordAdminRescheduleFailureTelemetry(input: AdminFailureTelemetryInput): Promise<void> {
    try {
      await this.adminRepo?.recordRescheduleFailure({
        stage: input.stage, code: this.sanitizeAdminCancelTelemetryCode(input.code),
        status: this.sanitizeAdminCancelTelemetryStatus(input.status), retryable: input.retryable ?? true
      });
    } catch { /* telemetry must never block reschedule UX */ }
  }

  sanitizeAdminCancelTelemetryCode(code: unknown): string {
    if (typeof code !== 'string') return 'UNKNOWN';
    return code.trim().toUpperCase().replace(/[^A-Z0-9_:-]/g, '_').slice(0, 64) || 'UNKNOWN';
  }

  sanitizeAdminCancelTelemetryStatus(status: unknown): number | undefined {
    return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
  }

  adminRescheduleTelemetryCode(error: unknown): 'PERMISSION_OR_STATE_GUARD' | 'SLOT_UNAVAILABLE' | 'UNEXPECTED_FAILURE' {
    const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error ?? '');
    if (/BRANCH|UNAUTHORIZED|TURNO_NOT_FOUND|INVALID_STATUS|TRANSITION|ACTIVE_BRANCH_REQUIRED/i.test(message)) {
      return 'PERMISSION_OR_STATE_GUARD';
    }
    if (/TURNO_SLOT_COLLISION|SLOT_CONFLICT|BLOCKED_TIME_COLLISION|conflict|no disponible|bloqueado/i.test(message)) {
      return 'SLOT_UNAVAILABLE';
    }
    return 'UNEXPECTED_FAILURE';
  }
}
