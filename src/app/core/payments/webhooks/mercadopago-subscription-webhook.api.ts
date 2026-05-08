import type { SupabaseClient } from '@supabase/supabase-js';
import type { SubscriptionEvent } from '../../billing/subscriptions/subscription-state-machine.api';

type WebhookResponse = {
  status: 200 | 202 | 400 | 401 | 409 | 422;
  data?: {
    accepted: boolean;
    decision: 'PROCESS' | 'IGNORE_DUPLICATE' | 'IGNORE_OUT_OF_ORDER' | 'REJECT_REPLAY' | 'REJECT_PAYLOAD_CONFLICT';
    dedupeKey: string;
    replayWindowSeconds?: number;
    event?: SubscriptionEvent;
  };
  error?: {
    code: 'INVALID_SIGNATURE' | 'REPLAY_WINDOW_EXCEEDED' | 'PAYLOAD_CONFLICT' | 'INVALID_PAYLOAD';
    message: string;
  };
};

type MercadoPagoSubscriptionWebhookPayload = {
  id?: string;
  type?: string;
  action?: SubscriptionEvent['eventType'];
  date_created?: string;
  data?: { id?: string };
  external_reference?: string;
  preapproval_plan_id?: string;
  status?: string;
  next_payment_date?: string;
};

export type WebhookLedgerRecord = {
  provider: 'mercado_pago';
  providerEventId: string;
  requestId: string;
  signatureTimestamp: number;
  signatureDigest: string;
  resourceId: string;
  action: string;
  payloadHash: string;
};

export type WebhookLedgerPort = {
  reserve(record: WebhookLedgerRecord): Promise<'reserved' | 'duplicate' | 'payload_conflict'>;
};

export type WebhookSignatureVerifier = (input: {
  rawBody: string;
  headers: Record<string, string>;
  signature: { ts: number; v1: string };
}) => Promise<boolean>;

const REPLAY_WINDOW_SECONDS = 5 * 60;

let configuredLedger: WebhookLedgerPort | null = null;
let configuredVerifier: WebhookSignatureVerifier | null = null;

function header(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

function parseSignature(headers: Record<string, string>): { ts: number; v1: string } | null {
  const rawSignature = header(headers, 'x-signature');
  if (!rawSignature) return null;

  const parts = rawSignature.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split('=').map((entry) => entry.trim());
    if (key && value) acc[key] = value;
    return acc;
  }, {});

  const ts = Number(parts['ts']);
  const v1 = parts['v1'];
  if (!Number.isFinite(ts) || !v1) return null;
  return { ts, v1 };
}

function isReplayAttempt(signature: { ts: number }, nowIso: string): boolean {
  const timestampMs = signature.ts > 9_999_999_999 ? signature.ts : signature.ts * 1000;
  const nowMs = new Date(nowIso).getTime();
  return Math.abs(nowMs - timestampMs) > REPLAY_WINDOW_SECONDS * 1000;
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return `sha256:${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
}

function mapPlanCode(planId: string | undefined): SubscriptionEvent['planCode'] {
  const normalized = (planId ?? '').toLowerCase();
  if (normalized.includes('basic') || normalized.includes('starter')) return 'BASIC';
  if (normalized.includes('medium') || normalized.includes('growth')) return 'MEDIUM';
  if (normalized.includes('pro')) return 'PRO';
  return 'FREE';
}

function parseEvent(rawBody: string, payloadHash: string): SubscriptionEvent | null {
  const payload = JSON.parse(rawBody) as MercadoPagoSubscriptionWebhookPayload;
  const providerEventId = payload.id;
  const providerSubscriptionId = payload.data?.id;
  const eventType = payload.action;

  if (!providerEventId || !providerSubscriptionId || !eventType || !payload.date_created) return null;

  return {
    provider: 'mercado_pago',
    providerEventId,
    providerSubscriptionId,
    eventType,
    occurredAtIso: payload.date_created,
    payloadHash,
    planCode: mapPlanCode(payload.preapproval_plan_id),
    currentPeriodStart: payload.action === 'subscription.payment_approved' ? payload.date_created : undefined,
    currentPeriodEnd: payload.next_payment_date
  };
}

export function configureMercadoPagoSubscriptionWebhookPorts(ports: {
  ledger: WebhookLedgerPort | null;
  verifier: WebhookSignatureVerifier | null;
}): void {
  configuredLedger = ports.ledger;
  configuredVerifier = ports.verifier;
}

export function createSupabaseWebhookLedger(supabase: Pick<SupabaseClient, 'from'>): WebhookLedgerPort {
  return {
    async reserve(record) {
      const { data: existing, error: readError } = await supabase
        .from('payment_webhook_events')
        .select('payload_hash')
        .eq('provider', record.provider)
        .eq('provider_event_id', record.providerEventId)
        .maybeSingle();

      if (readError) throw new Error(readError.message);
      if (existing?.payload_hash === record.payloadHash) return 'duplicate';
      if (existing?.payload_hash) return 'payload_conflict';

      const { error } = await supabase.from('payment_webhook_events').insert({
        provider: record.provider,
        provider_event_id: record.providerEventId,
        request_id: record.requestId,
        signature_ts: record.signatureTimestamp,
        signature_v1: record.signatureDigest,
        resource_id: record.resourceId,
        event_type: record.action,
        payload_hash: record.payloadHash,
        processed_at: null
      });

      if (error) throw new Error(error.message);
      return 'reserved';
    }
  };
}

async function verifySignature(input: { rawBody: string; headers: Record<string, string>; signature: { ts: number; v1: string } }): Promise<boolean> {
  if (!configuredVerifier) {
    throw new Error('Mercado Pago signature verifier is not configured.');
  }

  return configuredVerifier(input);
}

function getLedger(): WebhookLedgerPort {
  if (!configuredLedger) throw new Error('Webhook ledger is not configured. Wire createSupabaseWebhookLedger() to a service-role backend.');
  return configuredLedger;
}

export async function handleMercadoPagoSubscriptionWebhook(input: {
  headers: Record<string, string>;
  rawBody: string;
  nowIso: string;
}): Promise<WebhookResponse> {
  const signature = parseSignature(input.headers);
  if (!signature) return { status: 401, error: { code: 'INVALID_SIGNATURE', message: 'Invalid Mercado Pago webhook signature.' } };
  if (isReplayAttempt(signature, input.nowIso)) {
    return { status: 401, error: { code: 'REPLAY_WINDOW_EXCEEDED', message: 'Webhook timestamp is outside the replay window.' } };
  }

  if (!(await verifySignature({ rawBody: input.rawBody, headers: input.headers, signature }))) {
    return { status: 401, error: { code: 'INVALID_SIGNATURE', message: 'Invalid Mercado Pago webhook signature.' } };
  }

  let event: SubscriptionEvent | null;
  let payloadHash: string;
  try {
    payloadHash = await sha256Text(input.rawBody);
    event = parseEvent(input.rawBody, payloadHash);
  } catch {
    return { status: 400, error: { code: 'INVALID_PAYLOAD', message: 'Invalid subscription webhook payload.' } };
  }

  if (!event) return { status: 422, error: { code: 'INVALID_PAYLOAD', message: 'Missing required subscription webhook payload fields.' } };

  const requestId = header(input.headers, 'x-request-id');
  if (!requestId) return { status: 422, error: { code: 'INVALID_PAYLOAD', message: 'Missing x-request-id webhook header.' } };

  const dedupeKey = `mercado_pago:${event.providerEventId}`;
  const reserveResult = await getLedger().reserve({
    provider: 'mercado_pago',
    providerEventId: event.providerEventId,
    requestId,
    signatureTimestamp: signature.ts,
    signatureDigest: signature.v1,
    resourceId: event.providerSubscriptionId,
    action: event.eventType,
    payloadHash
  });

  if (reserveResult === 'duplicate') return { status: 200, data: { accepted: true, decision: 'IGNORE_DUPLICATE', dedupeKey } };
  if (reserveResult === 'payload_conflict') {
    return { status: 409, error: { code: 'PAYLOAD_CONFLICT', message: 'Provider event payload hash changed for an existing provider event id.' } };
  }

  return {
    status: 202,
    data: { accepted: true, decision: 'PROCESS', dedupeKey, replayWindowSeconds: REPLAY_WINDOW_SECONDS, event }
  };
}
