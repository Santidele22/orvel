import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = (...parts: string[]) => resolve(process.cwd(), '..', '..', ...parts);

const ELEVEN_LIFECYCLE_TYPES = [
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

const APPOINTMENT_TYPES = [
  'appointment.created',
  'appointment.cancelled',
  'appointment.rescheduled',
  'appointment.reminder',
] as const;

function latestEnqueueWebPushOutboxBody(): string {
  const migrationDir = repoRoot('supabase/migrations');
  const files = readdirSync(migrationDir)
    .filter((name) => name.endsWith('.sql') && !name.endsWith('_create_web_push_outbox.sql'))
    .sort();
  const pattern =
    /create\s+or\s+replace\s+function\s+public\.enqueue_web_push_outbox[\s\S]*?\$\$;/gi;
  let latest = '';
  for (const file of files) {
    const sql = readFileSync(resolve(migrationDir, file), 'utf8');
    const matches = sql.match(pattern);
    if (matches?.length) {
      latest = matches[matches.length - 1] ?? '';
    }
  }
  return latest;
}

describe('latest enqueue_web_push_outbox allowlist (not create-outbox)', () => {
  const enqueue = latestEnqueueWebPushOutboxBody();

  it('names the eleven spec strings plus existing appointment types', () => {
    expect(enqueue.length).toBeGreaterThan(0);
    for (const eventType of [...APPOINTMENT_TYPES, ...ELEVEN_LIFECYCLE_TYPES]) {
      expect(enqueue).toContain(`'${eventType}'`);
    }
  });

  it('keeps deposit.claimed and system.welcome off the latest enqueue allowlist', () => {
    expect(enqueue).not.toContain("'deposit.claimed'");
    expect(enqueue).not.toContain("'system.welcome'");
  });

  it('stays fail-open on enqueue exceptions', () => {
    expect(enqueue).toMatch(/EXCEPTION\s+WHEN\s+OTHERS\s+THEN\s+RETURN\s+NEW/i);
  });
});
