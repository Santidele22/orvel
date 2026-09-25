import { describe, expect, it } from 'vitest';

type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';

type ServerEntitlementSnapshot = {
  businessId: string;
  planCode: PlanCode;
  limits: {
    maxLocales: number;
    maxRubros: number;
  };
  usage: {
    locales: number;
    rubros: number;
  };
  source: 'server';
};

type UpgradeCardState = {
  planCode: PlanCode;
  cta: 'CURRENT_PLAN' | 'UPGRADE' | 'DOWNGRADE_DISABLED';
  disabled: boolean;
};

type UpgradeScreenViewModel = {
  source: 'server';
  currentPlan: PlanCode;
  usage: {
    locales: string;
    rubros: string;
  };
  cards: UpgradeCardState[];
};

type UpgradeScreenModule = {
  buildUpgradeScreenViewModel: (input: { snapshot: ServerEntitlementSnapshot }) => UpgradeScreenViewModel;
};

async function loadUpgradeScreenModule(): Promise<UpgradeScreenModule> {
  try {
    const mod = await import('../../core/billing/upgrade-screen-server-truth');
    return mod as UpgradeScreenModule;
  } catch {
    throw new Error(
      'TODO(Magnus/Aurora): add src/app/core/billing/upgrade-screen-server-truth.ts exporting buildUpgradeScreenViewModel({ snapshot }) that renders upgrade state from server entitlement truth.'
    );
  }
}

describe('Upgrade screen contract: consumes server entitlement truth', () => {
  it('builds view model strictly from server snapshot (plan + limits + usage)', async () => {
    const upgradeScreen = await loadUpgradeScreenModule();

    const viewModel = upgradeScreen.buildUpgradeScreenViewModel({
      snapshot: {
        businessId: 'biz_qa_001',
        planCode: 'MEDIUM',
        limits: {
          maxLocales: 3,
          maxRubros: 3
        },
        usage: {
          locales: 2,
          rubros: 3
        },
        source: 'server'
      }
    });

    expect(viewModel).toEqual({
      source: 'server',
      currentPlan: 'MEDIUM',
      usage: {
        locales: '2/3',
        rubros: '3/3'
      },
      cards: [
        { planCode: 'FREE', cta: 'DOWNGRADE_DISABLED', disabled: true },
        { planCode: 'BASIC', cta: 'DOWNGRADE_DISABLED', disabled: true },
        { planCode: 'MEDIUM', cta: 'CURRENT_PLAN', disabled: true },
        { planCode: 'PRO', cta: 'UPGRADE', disabled: false }
      ]
    });
  });
});
