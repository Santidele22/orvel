export const MERCADO_PAGO_SKELETON_V1 = {
  checkoutIntentRequest: {
    businessId: 'biz_mp_qa_001',
    planCode: 'MEDIUM',
    payer: {
      email: 'owner+biz_mp_qa_001@example.com',
      fullName: 'QA Mercado Pago Owner',
      nationalId: '27123456'
    },
    amount: {
      currency: 'ARS',
      unitAmountCents: 159900,
      quantity: 1,
      totalAmountCents: 159900
    },
    callbackUrls: {
      successUrl: 'https://app.salon.test/payments/success',
      failureUrl: 'https://app.salon.test/payments/failure',
      pendingUrl: 'https://app.salon.test/payments/pending'
    },
    idempotencyKey: 'idem_biz_mp_qa_001_medium_2026_04_21',
    provider: 'mercado_pago' as const,
    nowIso: '2026-04-21T10:00:00.000Z'
  },
  webhook: {
    headers: {
      'x-signature': 'ts=1710000000,v1=5f6e13f10cf6f5dca50b5d446f7304b3fdf43f8fd6e1d9ec0af0b783ca50a111',
      'x-request-id': 'req_mp_0001',
      'x-provider': 'mercado_pago'
    },
    rawBody:
      '{"id":"mp_evt_0001","action":"payment.updated","type":"payment","date_created":"2026-04-21T09:59:58.000Z","data":{"id":"mp_pay_0001"},"external_reference":"ext_biz_mp_qa_001_medium_001","status":"approved","transaction_amount":1599.00,"currency_id":"ARS"}',
    invalidSignatureHeaders: {
      'x-signature': 'ts=1710000000,v1=invalid-signature',
      'x-request-id': 'req_mp_0001',
      'x-provider': 'mercado_pago'
    },
    nowIso: '2026-04-21T10:00:05.000Z'
  },
  statusSyncRequest: {
    businessId: 'biz_mp_qa_001',
    provider: 'mercado_pago' as const,
    providerPaymentId: 'mp_pay_0001',
    externalReference: 'ext_biz_mp_qa_001_medium_001',
    expectedPlanCode: 'MEDIUM',
    nowIso: '2026-04-21T10:00:10.000Z'
  }
};
