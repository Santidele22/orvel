import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { configureMercadoPagoSubscriptionWebhookPorts, handleMercadoPagoSubscriptionWebhook } from './mercadopago-subscription-webhook.api';

const SOURCE_PATH = path.join(__dirname, 'mercadopago-subscription-webhook.api.ts');
const WEBHOOK_TS = Math.floor(new Date('2026-06-08T12:00:00.000Z').getTime() / 1000);

const HEADERS = {
  'x-signature': `ts=${WEBHOOK_TS},v1=valid-subscription-signature`,
  'x-request-id': 'req_subscription_preapproval_catalog'
};

function readSource(): string {
  expect(fs.existsSync(SOURCE_PATH), 'Missing Mercado Pago subscription webhook source file').toBe(true);
  return fs.readFileSync(SOURCE_PATH, 'utf8');
}

function subscriptionPreapprovalPayload(preapprovalPlanId: string): string {
  return JSON.stringify({
    id: `mp_evt_subscription_${preapprovalPlanId}`,
    type: 'subscription_preapproval',
    action: 'subscription.payment_approved',
    date_created: '2026-06-08T12:00:01.000Z',
    data: { id: 'mp_preapproval_subscription_catalog' },
    external_reference: 'subscription:business_catalog',
    preapproval_plan_id: preapprovalPlanId,
    status: 'authorized',
    next_payment_date: '2026-07-08T12:00:00.000Z'
  });
}

describe('RED contract: Mercado Pago subscription webhooks emit canonical catalog plans', () => {
  beforeEach(() => {
    configureMercadoPagoSubscriptionWebhookPorts({
      verifier: async ({ signature }) => signature.v1 === 'valid-subscription-signature',
      ledger: { reserve: async () => 'reserved' }
    });
  });

  it('treats preapproval/subscription as the source of truth instead of checkout plan mapping', () => {
    const source = readSource();

    expect(source, 'Webhook parsing must consume Mercado Pago subscription/preapproval identifiers').toMatch(/preapproval_plan_id|preapproval/i);
    expect(source, 'Billing tests and webhook code must not use checkout as the primary plan source of truth').not.toMatch(
      /checkout[_-]?session|checkout\s+plan|checkout\s+id/i
    );
    expect(source, 'Legacy paid plans must not be returned as canonical plan codes from webhook mapping').not.toMatch(
      /return\s+['"](?:BASIC|MEDIUM|STARTER|GROWTH|PRO)['"]/
    );
  });

  it.each([
    ['mp_preapproval_plan_premium_monthly', 'PREMIUM'],
    ['mp_preapproval_plan_starter_monthly', 'PREMIUM'],
    ['mp_preapproval_plan_growth_monthly', 'PREMIUM'],
    ['mp_preapproval_plan_pro_monthly', 'PREMIUM']
  ])('maps Mercado Pago subscription preapproval plan %s to canonical %s', async (preapprovalPlanId, expectedPlanCode) => {
    await expect(
      handleMercadoPagoSubscriptionWebhook({
        headers: HEADERS,
        rawBody: subscriptionPreapprovalPayload(preapprovalPlanId),
        nowIso: '2026-06-08T12:00:02.000Z'
      })
    ).resolves.toMatchObject({
      status: 202,
      data: {
        accepted: true,
        decision: 'PROCESS',
        event: {
          provider: 'mercado_pago',
          providerSubscriptionId: 'mp_preapproval_subscription_catalog',
          planCode: expectedPlanCode
        }
      }
    });
  });

  it.each([
    ['mp_preapproval_plan_basic_monthly', 'PREMIUM'],
    ['mp_preapproval_plan_medium_monthly', 'PREMIUM']
  ])('accepts legacy subscription aliases %s but normalizes output to %s', async (preapprovalPlanId, expectedPlanCode) => {
    await expect(
      handleMercadoPagoSubscriptionWebhook({
        headers: HEADERS,
        rawBody: subscriptionPreapprovalPayload(preapprovalPlanId),
        nowIso: '2026-06-08T12:00:02.000Z'
      })
    ).resolves.toMatchObject({
      status: 202,
      data: { event: { planCode: expectedPlanCode } }
    });
  });
});
