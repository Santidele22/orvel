export type PaidPlanMappingResolution =
  | { ok: true; preapprovalPlanId: string }
  | { ok: false; code: "PLAN_MAPPING_REQUIRED" | "PLAN_MAPPING_INVALID"; message: string };

export type CanonicalDomainErrorCode =
  | "PLAN_MAPPING_REQUIRED"
  | "PLAN_MAPPING_INVALID"
  | "IDEMPOTENCY_KEY_CONFLICT";

export function canonicalDomainErrorHttpStatus(code: CanonicalDomainErrorCode): 409 | 422 {
  if (code === "IDEMPOTENCY_KEY_CONFLICT") return 409;
  return 422;
}

export function hasValidPreapprovalPlanIdFormat(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

export function resolveTrustedPaidPlanMapping(input: {
  planPrice: number;
  catalogPreapprovalPlanId?: string | null;
  legacyPlanPreapprovalId?: string | null;
}): PaidPlanMappingResolution {
  if (input.planPrice <= 0) {
    return { ok: true, preapprovalPlanId: "" };
  }

  const resolved = (input.catalogPreapprovalPlanId || input.legacyPlanPreapprovalId || "").trim();
  if (!resolved) {
    return {
      ok: false,
      code: "PLAN_MAPPING_REQUIRED",
      message: "No existe mapping server-side de preapproval_plan_id para este plan pago",
    };
  }

  if (!hasValidPreapprovalPlanIdFormat(resolved)) {
    return {
      ok: false,
      code: "PLAN_MAPPING_INVALID",
      message: "El mapping server-side de preapproval_plan_id tiene formato inválido",
    };
  }

  return { ok: true, preapprovalPlanId: resolved };
}

export function mapWebhookStatusToSubscriptionStatus(eventType: string, mpStatus: string): "active" | "pending" | "paused" | "canceled" {
  const normalizedType = (eventType || "").toLowerCase();
  const normalizedStatus = (mpStatus || "").toLowerCase();

  if (normalizedStatus === "paused") return "paused";
  if (["cancelled", "canceled", "rejected"].includes(normalizedStatus)) return "canceled";

  if (normalizedStatus === "approved") return "active";

  // Guardrail: preapproval authorized means mandate approved,
  // but account activation must wait for a verified approved payment event.
  if (normalizedStatus === "authorized" && (normalizedType === "preapproval" || normalizedType === "subscription_preapproval")) {
    return "pending";
  }

  return "pending";
}
