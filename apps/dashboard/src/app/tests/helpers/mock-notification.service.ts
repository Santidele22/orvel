export type NotificationEventType = 'booking.created' | 'booking.cancelled';
export type NotificationChannel = 'email';
export type NotificationRecipientRole = 'admin' | 'client';
export type NotificationSourceRole = 'admin' | 'client';

export type NotificationEmitInput = {
  eventKey: string;
  eventType: NotificationEventType;
  channel: NotificationChannel;
  recipientRole: NotificationRecipientRole;
  appointmentId: string;
  occurredAt: string;
  sourceRole?: NotificationSourceRole;
};

export type NotificationPayload = NotificationEmitInput & {
  emittedAt: string;
};

export type NotificationEmitStatus = 'sent' | 'duplicate_ignored';

export type NotificationDispatchRecord = {
  status: NotificationEmitStatus;
  payload: NotificationPayload;
};

export interface NotificationServicePort {
  emit(input: NotificationEmitInput): NotificationDispatchRecord;
}

export class MockNotificationService implements NotificationServicePort {
  private readonly sentByEventKey = new Map<string, NotificationDispatchRecord>();
  private readonly recentLog: NotificationDispatchRecord[] = [];

  emit(input: NotificationEmitInput): NotificationDispatchRecord {
    const existing = this.sentByEventKey.get(input.eventKey);
    if (existing) {
      return {
        status: 'duplicate_ignored',
        payload: existing.payload
      };
    }

    const payload: NotificationPayload = {
      ...input,
      channel: 'email',
      emittedAt: new Date().toISOString()
    };

    const dispatched: NotificationDispatchRecord = {
      status: 'sent',
      payload
    };

    this.sentByEventKey.set(payload.eventKey, dispatched);
    this.recentLog.unshift(dispatched);

    return dispatched;
  }

  getRecentLog(): NotificationDispatchRecord[] {
    return [...this.recentLog];
  }
}
