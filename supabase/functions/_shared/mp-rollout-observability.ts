type LatencyBucket = "lt_500ms" | "lt_1000ms" | "lt_2500ms" | "gte_2500ms";

function toLatencyBucket(latencyMs: number): LatencyBucket {
  if (latencyMs < 500) return "lt_500ms";
  if (latencyMs < 1000) return "lt_1000ms";
  if (latencyMs < 2500) return "lt_2500ms";
  return "gte_2500ms";
}

function toOpaqueCorrelationId(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }

  return `corr_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function recordPreapprovalCreateMetric(input: {
  tenantId: string;
  userId: string;
  rolloutPercent: number;
  rolloutBucket: number;
  result: "success" | "error" | "blocked";
  retryable: boolean;
  idempotencyDecision: "first_seen" | "duplicate_processed" | "payload_conflict" | "not_applicable";
  latencyMs: number;
  httpStatus: number;
}): void {
  console.log(JSON.stringify({
    metric: 'mp_preapproval_create_result',
    tenant_id: input.tenantId,
    actor_correlation_id: toOpaqueCorrelationId(`${input.tenantId}:${input.userId}`),
    rollout_percent: input.rolloutPercent,
    rollout_bucket: input.rolloutBucket,
    result: input.result,
    retryable: input.retryable,
    idempotency_decision: input.idempotencyDecision,
    latency_ms: input.latencyMs,
    latency_bucket: toLatencyBucket(input.latencyMs),
    http_status: input.httpStatus,
  }));
}

export function recordWebhookProcessMetric(input: {
  providerEventId: string;
  result: "success" | "error" | "duplicate";
  retryable: boolean;
  idempotencyDecision: "first_seen" | "duplicate_processed" | "payload_conflict";
  latencyMs: number;
  httpStatus: number;
}): void {
  console.log(JSON.stringify({
    metric: 'mp_webhook_process_result',
    provider_event_id: input.providerEventId,
    result: input.result,
    retryable: input.retryable,
    idempotency_decision: input.idempotencyDecision,
    latency_ms: input.latencyMs,
    latency_bucket: toLatencyBucket(input.latencyMs),
    webhook_success: input.result === "success",
    http_status: input.httpStatus,
  }));
}
