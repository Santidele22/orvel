import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = (...parts: string[]) => resolve(process.cwd(), '..', '..', ...parts);
const readIfPresent = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '');

const migrationDir = repoRoot('supabase/migrations');
const migrationFile =
  existsSync(migrationDir) ?
    readdirSync(migrationDir).find((name) => name.endsWith('_create_web_push_outbox.sql'))
  : undefined;
const migration = migrationFile ? readIfPresent(resolve(migrationDir, migrationFile)) : '';
const edgeFnPath = repoRoot('supabase/functions/process-web-push-outbox/index.ts');
const helperPath = repoRoot('supabase/functions/_shared/process-web-push-outbox.ts');
const helper = readIfPresent(helperPath);
const config = readIfPresent(repoRoot('supabase/config.toml'));

const acceptedEvents = ['appointment.created', 'appointment.cancelled', 'appointment.rescheduled'];

describe('Issue #344 slice 2 — operator web push send', () => {
  it('migration creates web_push_outbox and a trigger that copies only the three event types', () => {
    expect(migrationFile, 'timestamped create_web_push_outbox migration').toBeTruthy();
    expect(migration).toMatch(/create table if not exists public\.web_push_outbox/i);
    expect(migration).toMatch(/notification_id/i);
    expect(migration).toMatch(/event_type/i);
    expect(migration).toMatch(/\btitle\b/i);
    expect(migration).toMatch(/\bbody\b/i);
    expect(migration).toMatch(/business_id/i);
    expect(migration).toMatch(/pending/i);
    expect(migration).toMatch(/skipped/i);
    expect(migration).toMatch(/enable row level security/i);
    expect(migration).toMatch(/service_role/i);
    expect(migration).not.toMatch(/for insert\s+to authenticated/i);
    expect(migration).toMatch(/after insert on public\.dashboard_notifications/i);
    for (const eventType of acceptedEvents) {
      expect(migration).toContain(eventType);
    }
    expect(migration).toMatch(/if[\s\S]*appointment\.created[\s\S]*appointment\.cancelled[\s\S]*appointment\.rescheduled[\s\S]*insert into public\.web_push_outbox/i);
    expect(migration).toMatch(/new\.title/i);
    expect(migration).toMatch(/new\.body/i);
    expect(migration).toMatch(/new\.business_id/i);
  });

  it('trigger does not enqueue other dashboard notification event types', () => {
    const enqueueFn = migration.match(
      /create or replace function[\s\S]*enqueue_web_push[\s\S]*?\$\$;/i,
    )?.[0] ?? migration;
    expect(enqueueFn).toMatch(/appointment\.created/);
    expect(enqueueFn).not.toMatch(/appointment\.reminder|appointment\.completed|system\.|payment\./);
    const insertCount = (enqueueFn.match(/insert into public\.web_push_outbox/gi) ?? []).length;
    expect(insertCount).toBe(1);
    expect(enqueueFn).toMatch(/if[\s\S]+insert into public\.web_push_outbox/i);
  });

  it('edge function exists and is registered like other CRON_KEY processors', () => {
    expect(existsSync(edgeFnPath), 'process-web-push-outbox/index.ts must exist').toBe(true);
    const edge = readIfPresent(edgeFnPath);
    expect(edge).toMatch(/CRON_KEY|x-cron-key/);
    expect(config).toMatch(/\[functions\.process-web-push-outbox\]/);
    expect(config).toMatch(/\[functions\.process-web-push-outbox\]\s*\nverify_jwt\s*=\s*false/);
  });

  it('helper skips when VAPID keys are missing and reuses inbox title/body plus /dashboard/turnos', () => {
    expect(existsSync(helperPath), 'process-web-push-outbox.ts must exist').toBe(true);
    expect(helper).toMatch(/shouldSkipWebPush/);
    expect(helper).toMatch(/missing_vapid|skipped/);
    expect(helper).toMatch(/buildOperatorWebPushPayload/);
    expect(helper).toContain('/dashboard/turnos');
    expect(helper).toMatch(/VAPID_PRIVATE_KEY/);
    expect(helper).toMatch(/VAPID_PUBLIC_KEY/);
    for (const eventType of acceptedEvents) {
      expect(helper).toContain(eventType);
    }
  });

  it('helper marks skipped/no_subscriptions when the send tally is 0/0/0', () => {
    expect(helper).toMatch(/resolveWebPushDeliveryStatus/);
    expect(helper).toMatch(/no_subscriptions/);
    expect(helper).toMatch(/sent\s*===?\s*0/);
    expect(helper).toMatch(/failed\s*===?\s*0/);
    expect(helper).not.toMatch(/failed\s*\?\s*['"]failed['"]\s*:\s*['"]sent['"]/);
  });
});
