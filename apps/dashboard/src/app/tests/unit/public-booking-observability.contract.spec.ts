// @vitest-environment jsdom

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  emitPublicBookingFailureEvent,
  PUBLIC_BOOKING_FAILURE_EVENT,
  setPublicBookingFailureTelemetryClientFactoryForTests,
  type PublicBookingFailureEvent
} from '../../core/observability/public-booking-operational-events';

function findRepoRoot(startDir: string): string {
  let current = startDir;

  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(current, 'supabase')) && existsSync(resolve(current, 'apps/dashboard'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return startDir;
}

const TELEMETRY_MIGRATION = resolve(
  findRepoRoot(process.cwd()),
  'supabase/migrations/_legacy/20260627235500_public_booking_failure_telemetry.sql'
);

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('public booking operational observability', () => {
  afterEach(() => {
    setPublicBookingFailureTelemetryClientFactoryForTests(undefined);
    vi.restoreAllMocks();
  });

  it('dispatches the browser event and records only sanitized allowlisted failure metadata', async () => {
    // Arrange
    const rpc = vi.fn().mockResolvedValue({ error: null });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(window, 'dispatchEvent');
    setPublicBookingFailureTelemetryClientFactoryForTests(() => ({ rpc }));

    // Act
    const event = emitPublicBookingFailureEvent({
      stage: 'availability',
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
      retryable: true
    });
    await flushPromises();

    // Assert
    expect(event).toEqual<PublicBookingFailureEvent>({
      feature: 'public-booking',
      stage: 'availability',
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
      retryable: true
    });
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: PUBLIC_BOOKING_FAILURE_EVENT,
      detail: event
    }));
    expect(rpc).toHaveBeenCalledWith('record_public_booking_failure', {
      p_stage: 'availability',
      p_code: 'SERVICE_UNAVAILABLE',
      p_status: 503,
      p_retryable: true
    });
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('message');
    expect(JSON.stringify(rpc.mock.calls[0]?.[1])).not.toContain('provider timeout raw stack trace');
  });

  it('never blocks UI emission when telemetry RPC fails', async () => {
    // Arrange
    const rpc = vi.fn().mockRejectedValue(new Error('network failure with raw provider detail'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setPublicBookingFailureTelemetryClientFactoryForTests(() => ({ rpc }));

    // Act
    const event = emitPublicBookingFailureEvent({ stage: 'service', code: 'SERVICE_LOAD_FAILED', status: 503 });
    await flushPromises();

    // Assert
    expect(event).toMatchObject({ stage: 'service', code: 'SERVICE_LOAD_FAILED', status: 503 });
    expect(console.warn).toHaveBeenCalledWith(
      '[PublicBooking] Operational failure event emitted.',
      expect.objectContaining({ stage: 'service', code: 'SERVICE_LOAD_FAILED' })
    );
  });

  it('supports sanitized admin reschedule auth fallback telemetry through the unauthenticated public sink', async () => {
    // Arrange
    const rpc = vi.fn().mockResolvedValue({ error: null });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setPublicBookingFailureTelemetryClientFactoryForTests(() => ({ rpc }));

    // Act
    const event = emitPublicBookingFailureEvent({
      stage: 'service',
      code: 'ADMIN_RESCHEDULE_AUTH_REQUIRED',
      status: 401,
      retryable: true
    });
    await flushPromises();

    // Assert
    expect(event).toEqual<PublicBookingFailureEvent>({
      feature: 'public-booking',
      stage: 'service',
      code: 'ADMIN_RESCHEDULE_AUTH_REQUIRED',
      status: 401,
      retryable: true
    });
    expect(rpc).toHaveBeenCalledWith('record_public_booking_failure', {
      p_stage: 'service',
      p_code: 'ADMIN_RESCHEDULE_AUTH_REQUIRED',
      p_status: 401,
      p_retryable: true
    });
  });

  it('checks in a narrow Supabase RPC sink without table grants or raw message columns', () => {
    // Arrange / Act
    const migration = readFileSync(TELEMETRY_MIGRATION, 'utf-8');

    // Assert
    expect(migration).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.public_booking_failure_events/i);
    expect(migration).toMatch(/stage\s+text\s+not\s+null\s+check\s*\(stage\s+in\s*\('resolver',\s*'service',\s*'availability',\s*'submit'\)\)/i);
    expect(migration).toMatch(/code\s+text\s+not\s+null\s+check\s*\(code\s+~\s+'\^\[A-Z0-9_:-\]\{1,64\}\$'\)/i);
    expect(migration).toMatch(/security\s+definer[\s\S]*set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
    expect(migration).toMatch(/grant\s+execute\s+on\s+function\s+public\.record_public_booking_failure\(text,\s*text,\s*integer,\s*boolean\)\s+to\s+anon,\s*authenticated/i);
    expect(migration).toMatch(/revoke\s+all\s+on\s+table\s+public\.public_booking_failure_events\s+from\s+anon,\s*authenticated/i);
    expect(migration).not.toMatch(/\bmessage\b|\berror\b|\bstack\b|\bdetails\b|\bbooking_id\b/i);
  });
});
