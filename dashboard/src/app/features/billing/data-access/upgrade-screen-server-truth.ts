import type { EntitlementSnapshot } from '../../../core/entitlements/server-entitlements.api';
import { normalizePlanCode, type PlanCode } from '../../../core/plans/plan-entitlements';

export type UpgradeCardState = {
  planCode: PlanCode;
  cta: 'CURRENT_PLAN' | 'UPGRADE' | 'DOWNGRADE_DISABLED';
  disabled: boolean;
};

export type UpgradeScreenViewModel = {
  source: 'server';
  currentPlan: PlanCode;
  usage: {
    locales: string;
    rubros: string;
  };
  cards: UpgradeCardState[];
};

type BuildUpgradeScreenViewModelInput = {
  snapshot: EntitlementSnapshot;
};

const PLAN_ORDER: PlanCode[] = ['STARTER', 'GROWTH', 'PRO'];

function getPlanIndex(planCode: PlanCode): number {
  return PLAN_ORDER.indexOf(planCode);
}

function resolveCardState(planCode: PlanCode, currentPlan: PlanCode): UpgradeCardState {
  const targetIndex = getPlanIndex(planCode);
  const currentIndex = getPlanIndex(currentPlan);

  if (targetIndex === currentIndex) {
    return {
      planCode,
      cta: 'CURRENT_PLAN',
      disabled: true
    };
  }

  if (targetIndex < currentIndex) {
    return {
      planCode,
      cta: 'DOWNGRADE_DISABLED',
      disabled: true
    };
  }

  return {
    planCode,
    cta: 'UPGRADE',
    disabled: false
  };
}

export function buildUpgradeScreenViewModel(input: BuildUpgradeScreenViewModelInput): UpgradeScreenViewModel {
  const { snapshot } = input;

  return {
    source: 'server',
    currentPlan: normalizePlanCode(snapshot.planCode),
    usage: {
      locales: `${snapshot.usage.locales}/${snapshot.limits.maxLocales}`,
      rubros: `${snapshot.usage.rubros}/${snapshot.limits.maxRubros}`
    },
    cards: PLAN_ORDER.map((planCode) => resolveCardState(planCode, normalizePlanCode(snapshot.planCode)))
  };
}
