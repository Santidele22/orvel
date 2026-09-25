import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const apiPath = resolve(process.cwd(), 'src/app/core/notifications/internal-dashboard-notifications.api.ts');
const api = readFileSync(apiPath, 'utf8');

const unionMatch = api.match(/export type DashboardNotificationEventType\s*=([\s\S]*?);/);
const union = unionMatch?.[1] ?? '';

const REQUIRED_TYPES = [
  'appointment.created',
  'appointment.cancelled',
  'appointment.rescheduled',
  'appointment.reminder',
  'lifecycle.briefing',
  'lifecycle.first_turno_soon',
  'lifecycle.empty_agenda',
  'lifecycle.stale_deposit_claim',
  'onboarding.no_services',
  'onboarding.no_hours',
  'onboarding.copy_link',
  'onboarding.share_day7',
  'retention.first_public_booking',
  'retention.public_gap_7d',
  'retention.customer_cancelled_twice',
] as const;

describe('dashboard lifecycle inbox TypeScript contract', () => {
  it('includes appointment types and the eleven spec strings on DashboardNotificationEventType', () => {
    expect(union.length).toBeGreaterThan(0);
    for (const eventType of REQUIRED_TYPES) {
      expect(union).toContain(`'${eventType}'`);
    }
  });

  it('does not put inbox-only deposit.claimed on the event-type union', () => {
    expect(union).not.toContain('deposit.claimed');
  });

  it('allows nullable appointmentId for business-level rows', () => {
    expect(api).toMatch(/appointmentId:\s*string\s*\|\s*null/);
  });
});
