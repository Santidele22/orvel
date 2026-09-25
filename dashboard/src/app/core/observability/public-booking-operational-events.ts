import { createDashboardSupabaseClient } from '../runtime/supabase-client.factory';
import { loadDashboardRuntimeEnv } from '../runtime/dashboard-env';

export const PUBLIC_BOOKING_FAILURE_EVENT = 'orvel.public-booking.failure';

export type PublicBookingFailureStage = 'resolver' | 'service' | 'availability' | 'submit';

export type PublicBookingFailureEvent = {
  feature: 'public-booking';
  stage: PublicBookingFailureStage;
  code: string;
  status?: number;
  retryable: boolean;
};

type PublicBookingTelemetryClient = {
  rpc: (name: 'record_public_booking_failure', args: {
    p_stage: PublicBookingFailureStage;
    p_code: string;
    p_status?: number;
    p_retryable: boolean;
  }) => PromiseLike<{ error?: unknown }>;
};

let telemetryClient: PublicBookingTelemetryClient | null | undefined;
let telemetryClientFactory: (() => PublicBookingTelemetryClient | null) | undefined;

function sanitizeCode(code: unknown): string {
  if (typeof code !== 'string') return 'UNKNOWN';

  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9_:-]/g, '_').slice(0, 64);
  return normalized || 'UNKNOWN';
}

function sanitizeStatus(status: unknown): number | undefined {
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
}

function getTelemetryClient(): PublicBookingTelemetryClient | null {
  if (telemetryClient !== undefined) return telemetryClient;

  try {
    telemetryClient = telemetryClientFactory
      ? telemetryClientFactory()
      : createDashboardSupabaseClient<PublicBookingTelemetryClient>({ env: loadDashboardRuntimeEnv() });
  } catch {
    telemetryClient = null;
  }

  return telemetryClient;
}

async function recordPublicBookingFailure(event: PublicBookingFailureEvent): Promise<void> {
  const client = getTelemetryClient();
  if (!client) return;

  try {
    await client.rpc('record_public_booking_failure', {
      p_stage: event.stage,
      p_code: event.code,
      p_status: event.status,
      p_retryable: event.retryable
    });
  } catch {
    // Telemetry must never affect public booking UX.
  }
}

export function setPublicBookingFailureTelemetryClientFactoryForTests(
  factory?: () => PublicBookingTelemetryClient | null
): void {
  telemetryClientFactory = factory;
  telemetryClient = undefined;
}

export function emitPublicBookingFailureEvent(input: {
  stage: PublicBookingFailureStage;
  code?: unknown;
  status?: unknown;
  retryable?: boolean;
}): PublicBookingFailureEvent {
  const event: PublicBookingFailureEvent = {
    feature: 'public-booking',
    stage: input.stage,
    code: sanitizeCode(input.code),
    status: sanitizeStatus(input.status),
    retryable: input.retryable ?? true
  };

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent<PublicBookingFailureEvent>(PUBLIC_BOOKING_FAILURE_EVENT, { detail: event }));
  }

  console.warn('[PublicBooking] Operational failure event emitted.', event);
  void recordPublicBookingFailure(event);
  return event;
}
