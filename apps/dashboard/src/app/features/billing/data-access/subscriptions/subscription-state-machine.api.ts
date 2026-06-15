export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'canceled'
  | 'expired'
  | 'scheduled_change';

export type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';

export type SubscriptionSnapshot = {
  businessId: string;
  tenantId: string;
  subscriptionId: string;
  planCode: PlanCode;
  status: SubscriptionStatus;
  provider: 'mercado_pago';
  providerSubscriptionId: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  version: number;
};

export type SubscriptionEvent = {
  provider: 'mercado_pago';
  providerEventId: string;
  providerSubscriptionId: string;
  eventType:
    | 'subscription.authorized'
    | 'subscription.payment_approved'
    | 'subscription.payment_rejected'
    | 'subscription.cancelled'
    | 'subscription.paused'
    | 'subscription.plan_changed';
  occurredAtIso: string;
  payloadHash: string;
  planCode?: PlanCode;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
};

export type StateMachineDecision =
  | {
      accepted: true;
      action: 'ACTIVATE' | 'RENEW' | 'MARK_PAST_DUE' | 'CANCEL_NOW' | 'SCHEDULE_CANCEL' | 'PAUSE' | 'SCHEDULE_PLAN_CHANGE' | 'APPLY_PLAN_CHANGE';
      next: SubscriptionSnapshot;
    }
  | {
      accepted: false;
      action: 'IGNORE_DUPLICATE' | 'IGNORE_OUT_OF_ORDER' | 'REJECT_INVALID_TRANSITION';
      reason: string;
      current: SubscriptionSnapshot;
    };

export type SubscriptionTransitionRepository = {
  persistTransition(input: {
    current: SubscriptionSnapshot;
    event: SubscriptionEvent;
    decision: Extract<StateMachineDecision, { accepted: true }>;
  }): Promise<SubscriptionSnapshot>;
};

let configuredTransitionRepository: SubscriptionTransitionRepository | null = null;

export function configureSubscriptionTransitionRepository(repository: SubscriptionTransitionRepository | null): void {
  configuredTransitionRepository = repository;
}

const PLAN_RANK: Record<PlanCode, number> = {
  FREE: 0,
  BASIC: 1,
  MEDIUM: 2,
  PRO: 3
};

function bumpVersion(current: SubscriptionSnapshot, patch: Partial<SubscriptionSnapshot>): SubscriptionSnapshot {
  return {
    ...current,
    ...patch,
    version: current.version + 1
  };
}

function isOutOfOrder(current: SubscriptionSnapshot, event: SubscriptionEvent): boolean {
  return new Date(event.occurredAtIso).getTime() < new Date(current.currentPeriodStart).getTime();
}

export async function reduceSubscriptionEvent(input: {
  current: SubscriptionSnapshot;
  event: SubscriptionEvent;
  nowIso: string;
}): Promise<StateMachineDecision> {
  const { current, event } = input;

  if (event.providerSubscriptionId !== current.providerSubscriptionId) {
    return {
      accepted: false,
      action: 'REJECT_INVALID_TRANSITION',
      reason: 'Provider subscription id does not match current subscription.',
      current
    };
  }

  if (isOutOfOrder(current, event)) {
    return {
      accepted: false,
      action: 'IGNORE_OUT_OF_ORDER',
      reason: 'Event is older than the current billing period and is treated as out-of-order.',
      current
    };
  }

  switch (event.eventType) {
    case 'subscription.payment_approved': {
      const nextPeriodStart = event.currentPeriodStart ?? current.currentPeriodStart;
      const nextPeriodEnd = event.currentPeriodEnd ?? current.currentPeriodEnd;
      return {
        accepted: true,
        action: 'RENEW',
        next: bumpVersion(current, {
          status: 'active',
          planCode: event.planCode ?? current.planCode,
          currentPeriodStart: nextPeriodStart,
          currentPeriodEnd: nextPeriodEnd,
          cancelAtPeriodEnd: false
        })
      };
    }
    case 'subscription.payment_rejected':
      return {
        accepted: true,
        action: 'MARK_PAST_DUE',
        next: bumpVersion(current, { status: 'past_due' })
      };
    case 'subscription.cancelled':
      return {
        accepted: true,
        action: 'CANCEL_NOW',
        next: bumpVersion(current, { status: 'canceled', cancelAtPeriodEnd: false })
      };
    case 'subscription.paused':
      return {
        accepted: true,
        action: 'PAUSE',
        next: bumpVersion(current, { status: 'paused' })
      };
    case 'subscription.authorized':
      return {
        accepted: true,
        action: 'ACTIVATE',
        next: bumpVersion(current, { status: 'active', cancelAtPeriodEnd: false })
      };
    case 'subscription.plan_changed':
      return {
        accepted: true,
        action: 'APPLY_PLAN_CHANGE',
        next: bumpVersion(current, { planCode: event.planCode ?? current.planCode, status: 'active' })
      };
  }
}

export async function persistSubscriptionEventTransition(input: {
  current: SubscriptionSnapshot;
  event: SubscriptionEvent;
  nowIso: string;
}): Promise<StateMachineDecision> {
  const decision = await reduceSubscriptionEvent(input);
  if (!decision.accepted) return decision;

  if (!configuredTransitionRepository) {
    throw new Error('Subscription transition repository not configured. Persist state transitions through the backend RPC before acknowledging webhooks.');
  }

  const next = await configuredTransitionRepository.persistTransition({
    current: input.current,
    event: input.event,
    decision
  });

  return { ...decision, next };
}

export async function cancelSubscription(input: {
  current: SubscriptionSnapshot;
  mode: 'immediate' | 'end_of_period';
  requestedAtIso: string;
}): Promise<StateMachineDecision> {
  if (input.current.status === 'canceled' || input.current.status === 'expired') {
    return {
      accepted: false,
      action: 'REJECT_INVALID_TRANSITION',
      reason: 'Subscription is already terminal.',
      current: input.current
    };
  }

  if (input.mode === 'immediate') {
    return {
      accepted: true,
      action: 'CANCEL_NOW',
      next: bumpVersion(input.current, { status: 'canceled', cancelAtPeriodEnd: false })
    };
  }

  return {
    accepted: true,
    action: 'SCHEDULE_CANCEL',
    next: bumpVersion(input.current, { cancelAtPeriodEnd: true })
  };
}

export async function changeSubscriptionPlan(input: {
  current: SubscriptionSnapshot;
  targetPlanCode: Exclude<PlanCode, 'FREE'>;
  effective: 'immediate' | 'next_period';
  requestedAtIso: string;
}): Promise<StateMachineDecision> {
  const isUpgrade = PLAN_RANK[input.targetPlanCode] > PLAN_RANK[input.current.planCode];

  if (input.effective === 'immediate' || isUpgrade) {
    return {
      accepted: true,
      action: 'APPLY_PLAN_CHANGE',
      next: bumpVersion(input.current, { planCode: input.targetPlanCode, status: 'active' })
    };
  }

  return {
    accepted: true,
    action: 'SCHEDULE_PLAN_CHANGE',
    next: bumpVersion(input.current, { status: 'scheduled_change' })
  };
}
