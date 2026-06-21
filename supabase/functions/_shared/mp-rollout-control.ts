const ALLOWED_ROLLOUT_PERCENTAGES = new Set([0, 10, 50, 100]);

type RolloutEnvironment = "development" | "staging" | "production";

export type PreapprovalRolloutInput = {
  tenantId: string;
  userId: string;
  environment: RolloutEnvironment;
  rolloutPercentConfig?: string;
};

export type PreapprovalRolloutDecision = {
  allowed: boolean;
  rolloutPercent: number;
  bucket: number;
  key: string;
  configValid: boolean;
};

function normalizeRolloutPercent(rawValue: string | undefined): { value: number; valid: boolean } {
  const parsed = Number(rawValue);
  const normalized = Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;

  if (ALLOWED_ROLLOUT_PERCENTAGES.has(normalized)) {
    return { value: normalized, valid: true };
  }

  return { value: 0, valid: false };
}

function computeStableBucket(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash % 100;
}

export function evaluatePreapprovalPlanRollout(input: PreapprovalRolloutInput): PreapprovalRolloutDecision {
  if (input.environment !== "production") {
    return {
      allowed: true,
      rolloutPercent: 100,
      bucket: 0,
      key: "non-production",
      configValid: true,
    };
  }

  const rawRolloutPercent = Object.hasOwn(input, "rolloutPercentConfig")
    ? input.rolloutPercentConfig
    : Deno.env.get("MP_PREAPPROVAL_PLAN_ROLLOUT_PERCENT");
  const normalizedRollout = normalizeRolloutPercent(rawRolloutPercent);
  const rolloutPercent = normalizedRollout.value;
  const key = `${input.tenantId}:${input.userId}`; // tenantId:userId
  const bucket = computeStableBucket(key);

  if (!normalizedRollout.valid) {
    console.error(JSON.stringify({
      event: "security_rollout_config_invalid",
      severity: "high",
      control: "MP_PREAPPROVAL_PLAN_ROLLOUT_PERCENT",
      environment: input.environment,
      provided_value: rawRolloutPercent ?? null,
      enforced_rollout_percent: rolloutPercent,
      behavior: "fail_closed",
    }));
  }

  return {
    allowed: bucket < rolloutPercent,
    rolloutPercent,
    bucket,
    key,
    configValid: normalizedRollout.valid,
  };
}
