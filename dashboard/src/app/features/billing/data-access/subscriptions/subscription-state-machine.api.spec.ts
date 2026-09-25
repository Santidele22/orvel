import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { changeSubscriptionPlan, reduceSubscriptionEvent, type SubscriptionSnapshot } from './subscription-state-machine.api';

const SOURCE_PATH = path.join(__dirname, 'subscription-state-machine.api.ts');

const ACTIVE_GROWTH_SUBSCRIPTION: SubscriptionSnapshot = {
  businessId: 'biz_state_machine_catalog',
  tenantId: 'tenant_state_machine_catalog',
  subscriptionId: 'sub_state_machine_catalog',
  planCode: 'GROWTH' as any,
  status: 'active',
  provider: 'manual',
  providerSubscriptionId: 'mp_preapproval_state_machine_catalog',
  currentPeriodStart: '2026-06-01T00:00:00.000Z',
  currentPeriodEnd: '2026-07-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  version: 3
};

function readSource(): string {
  expect(fs.existsSync(SOURCE_PATH), 'Missing subscription state machine source file').toBe(true);
  return fs.readFileSync(SOURCE_PATH, 'utf8');
}

describe('RED contract: subscription state machine uses catalog canonical plans', () => {
  it('does not keep a local legacy PlanCode or PLAN_RANK source of truth', () => {
    const source = readSource();

    expect(source, 'PlanCode must be imported/derived from the catalog domain; BASIC/MEDIUM are aliases only').not.toMatch(
      /type\s+PlanCode\s*=\s*['"]FREE['"]\s*\|\s*['"]BASIC['"]\s*\|\s*['"]MEDIUM['"]\s*\|\s*['"]PRO['"]/
    );
    expect(source, 'Do not hardcode billing plan rank with BASIC/MEDIUM as canonical order').not.toMatch(
      /PLAN_RANK[\s\S]{0,240}\bBASIC\b[\s\S]{0,120}\bMEDIUM\b/
    );
  });

  it('normalizes legacy BASIC/MEDIUM event inputs to canonical STARTER/GROWTH outputs', async () => {
    await expect(
      reduceSubscriptionEvent({
        current: ACTIVE_GROWTH_SUBSCRIPTION,
        nowIso: '2026-06-05T00:00:00.000Z',
        event: {
          provider: 'manual',
          providerEventId: 'mp_evt_legacy_alias_basic',
          providerSubscriptionId: ACTIVE_GROWTH_SUBSCRIPTION.providerSubscriptionId,
          eventType: 'subscription.plan_changed',
          occurredAtIso: '2026-06-05T00:00:00.000Z',
          payloadHash: 'sha256:legacy-basic-alias',
          planCode: 'BASIC' as any
        }
      })
    ).resolves.toMatchObject({
      accepted: true,
      action: 'APPLY_PLAN_CHANGE',
      next: { planCode: 'STARTER' }
    });

    await expect(
      reduceSubscriptionEvent({
        current: { ...ACTIVE_GROWTH_SUBSCRIPTION, planCode: 'STARTER' as any },
        nowIso: '2026-06-05T00:00:00.000Z',
        event: {
          provider: 'manual',
          providerEventId: 'mp_evt_legacy_alias_medium',
          providerSubscriptionId: ACTIVE_GROWTH_SUBSCRIPTION.providerSubscriptionId,
          eventType: 'subscription.payment_approved',
          occurredAtIso: '2026-06-05T00:00:00.000Z',
          payloadHash: 'sha256:legacy-medium-alias',
          planCode: 'MEDIUM' as any,
          currentPeriodStart: '2026-06-05T00:00:00.000Z',
          currentPeriodEnd: '2026-07-05T00:00:00.000Z'
        }
      })
    ).resolves.toMatchObject({
      accepted: true,
      action: 'RENEW',
      next: { planCode: 'GROWTH' }
    });
  });

  it('derives upgrade/downgrade order from catalog canonical FREE/STARTER/GROWTH/PRO order', async () => {
    await expect(
      changeSubscriptionPlan({
        current: { ...ACTIVE_GROWTH_SUBSCRIPTION, planCode: 'STARTER' as any },
        targetPlanCode: 'GROWTH' as any,
        effective: 'next_period',
        requestedAtIso: '2026-06-10T12:00:00.000Z'
      })
    ).resolves.toMatchObject({
      accepted: true,
      action: 'APPLY_PLAN_CHANGE',
      next: { planCode: 'GROWTH', status: 'active' }
    });

    await expect(
      changeSubscriptionPlan({
        current: ACTIVE_GROWTH_SUBSCRIPTION,
        targetPlanCode: 'STARTER' as any,
        effective: 'next_period',
        requestedAtIso: '2026-06-10T12:00:00.000Z'
      })
    ).resolves.toMatchObject({
      accepted: true,
      action: 'SCHEDULE_PLAN_CHANGE',
      next: { planCode: 'GROWTH', status: 'scheduled_change' }
    });
  });
});
