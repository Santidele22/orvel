type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';
type AccountState = 'enabled' | 'pending_payment';
type SimulationOutcome = 'success' | 'failure' | 'cancel';

type FakeMoneySimulationResult = {
  accountId: string;
  accountState: AccountState;
  nextRoute: 'dashboard_home' | 'billing_checkout';
  retry?: {
    allowed: boolean;
    route: 'billing_checkout';
    reason: 'payment_failure';
    attemptId: string;
  };
};

type FakeMoneySimulatorDependencies = {
  accountRepository: {
    setAccountState: (input: {
      tenantAccountId: string;
      accountId: string;
      selectedPlan: PlanCode;
      accountState: AccountState;
    }) => Promise<void>;
  };
  auditRepository: {
    appendEvent: (input: {
      tenantAccountId: string;
      accountId: string;
      eventName:
        | 'fake_money_subscription_succeeded'
        | 'fake_money_subscription_failed'
        | 'fake_money_subscription_cancelled';
      simulationMode: 'test';
      outcome: SimulationOutcome;
      at: number;
    }) => Promise<void>;
  };
  now?: () => number;
  retryAttemptIdFactory?: () => string;
};

function assertTenantScope(input: { tenantContext: { accountId: string }; accountId: string }): string {
  const tenantAccountId = input.tenantContext?.accountId?.trim();
  const scopedAccountId = input.accountId?.trim();

  if (!tenantAccountId) {
    throw new Error('Tenant account context is required.');
  }

  if (!scopedAccountId || scopedAccountId !== tenantAccountId) {
    throw new Error('Account must remain within tenant context.');
  }

  return tenantAccountId;
}

function assertSimulationSegregation(testMode: boolean): void {
  if (!testMode) {
    throw new Error('Test mode is required for fake-money simulation segregation.');
  }
}

export function createFakeMoneySubscriptionSimulator(deps: FakeMoneySimulatorDependencies) {
  const now = deps.now ?? (() => Date.now());
  const retryAttemptIdFactory = deps.retryAttemptIdFactory ?? (() => `retry-${now()}`);

  return {
    async simulate(input: {
      tenantContext: { accountId: string };
      accountId: string;
      selectedPlan: PlanCode;
      outcome: SimulationOutcome;
      testMode: boolean;
    }): Promise<FakeMoneySimulationResult> {
      assertSimulationSegregation(input.testMode);
      const tenantAccountId = assertTenantScope({
        tenantContext: input.tenantContext,
        accountId: input.accountId
      });

      const eventAt = now();

      if (input.outcome === 'success') {
        await deps.accountRepository.setAccountState({
          tenantAccountId,
          accountId: input.accountId,
          selectedPlan: input.selectedPlan,
          accountState: 'enabled'
        });

        await deps.auditRepository.appendEvent({
          tenantAccountId,
          accountId: input.accountId,
          eventName: 'fake_money_subscription_succeeded',
          simulationMode: 'test',
          outcome: 'success',
          at: eventAt
        });

        return {
          accountId: input.accountId,
          accountState: 'enabled',
          nextRoute: 'dashboard_home'
        };
      }

      await deps.accountRepository.setAccountState({
        tenantAccountId,
        accountId: input.accountId,
        selectedPlan: input.selectedPlan,
        accountState: 'pending_payment'
      });

      await deps.auditRepository.appendEvent({
        tenantAccountId,
        accountId: input.accountId,
        eventName: input.outcome === 'failure' ? 'fake_money_subscription_failed' : 'fake_money_subscription_cancelled',
        simulationMode: 'test',
        outcome: input.outcome,
        at: eventAt
      });

      if (input.outcome === 'failure') {
        return {
          accountId: input.accountId,
          accountState: 'pending_payment',
          nextRoute: 'billing_checkout',
          retry: {
            allowed: true,
            route: 'billing_checkout',
            reason: 'payment_failure',
            attemptId: retryAttemptIdFactory()
          }
        };
      }

      return {
        accountId: input.accountId,
        accountState: 'pending_payment',
        nextRoute: 'billing_checkout'
      };
    }
  };
}
