import { describe, expect, it, vi } from 'vitest';

type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';
type AccountState = 'enabled' | 'pending_payment';
type SimulationOutcome = 'success' | 'failure' | 'cancel';

type FakeMoneySimulationResult = {
  accountId: string;
  accountState: AccountState;
  nextRoute: 'dashboard_home' | 'billing_subscription';
  retry?: {
    allowed: boolean;
    route: 'billing_subscription';
    reason: 'payment_failure';
    attemptId: string;
  };
};

type FakeMoneySimulatorModule = {
  createFakeMoneySubscriptionSimulator: (deps: {
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
  }) => {
    simulate: (input: {
      tenantContext: { accountId: string };
      accountId: string;
      selectedPlan: PlanCode;
      outcome: SimulationOutcome;
      testMode: boolean;
    }) => Promise<FakeMoneySimulationResult>;
  };
};

async function loadFakeMoneySimulatorModule(): Promise<FakeMoneySimulatorModule> {
  try {
    const mod = await import('../../features/billing/data-access/payments/fake-money-subscription-simulator');
    return mod as FakeMoneySimulatorModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/payments/fake-money-subscription-simulator.ts exporting createFakeMoneySubscriptionSimulator({ accountRepository, auditRepository, now, retryAttemptIdFactory }) with simulate({ tenantContext, accountId, selectedPlan, outcome, testMode }).'
    );
  }
}

describe('SB-03 RED contract: fake-money subscription simulation outcomes', () => {
  it('success outcome enables account and writes test-mode segregated audit event', async () => {
    const simulatorModule = await loadFakeMoneySimulatorModule();
    const setAccountStateSpy = vi.fn(async () => undefined);
    const appendEventSpy = vi.fn(async () => undefined);

    const simulator = simulatorModule.createFakeMoneySubscriptionSimulator({
      accountRepository: {
        setAccountState: setAccountStateSpy
      },
      auditRepository: {
        appendEvent: appendEventSpy
      },
      now: () => 1710000000000
    });

    const result = await simulator.simulate({
      tenantContext: { accountId: 'acc-001' },
      accountId: 'acc-001',
      selectedPlan: 'PRO',
      outcome: 'success',
      testMode: true
    });

    expect(setAccountStateSpy).toHaveBeenCalledWith({
      tenantAccountId: 'acc-001',
      accountId: 'acc-001',
      selectedPlan: 'PRO',
      accountState: 'enabled'
    });

    expect(appendEventSpy).toHaveBeenCalledWith({
      tenantAccountId: 'acc-001',
      accountId: 'acc-001',
      eventName: 'fake_money_subscription_succeeded',
      simulationMode: 'test',
      outcome: 'success',
      at: 1710000000000
    });

    expect(result).toEqual({
      accountId: 'acc-001',
      accountState: 'enabled',
      nextRoute: 'dashboard_home'
    });
  });

  it('failure outcome keeps account pending and returns retry path contract data', async () => {
    const simulatorModule = await loadFakeMoneySimulatorModule();
    const setAccountStateSpy = vi.fn(async () => undefined);

    const simulator = simulatorModule.createFakeMoneySubscriptionSimulator({
      accountRepository: {
        setAccountState: setAccountStateSpy
      },
      auditRepository: {
        appendEvent: async () => undefined
      },
      now: () => 1710000001000,
      retryAttemptIdFactory: () => 'retry-att-001'
    });

    const result = await simulator.simulate({
      tenantContext: { accountId: 'acc-001' },
      accountId: 'acc-001',
      selectedPlan: 'MEDIUM',
      outcome: 'failure',
      testMode: true
    });

    expect(setAccountStateSpy).toHaveBeenCalledWith({
      tenantAccountId: 'acc-001',
      accountId: 'acc-001',
      selectedPlan: 'MEDIUM',
      accountState: 'pending_payment'
    });

    expect(result).toEqual({
      accountId: 'acc-001',
      accountState: 'pending_payment',
      nextRoute: 'billing_subscription',
      retry: {
        allowed: true,
        route: 'billing_subscription',
        reason: 'payment_failure',
        attemptId: 'retry-att-001'
      }
    });
  });

  it('cancel outcome keeps account pending and never upgrades to enabled', async () => {
    const simulatorModule = await loadFakeMoneySimulatorModule();
    const setAccountStateSpy = vi.fn(async () => undefined);

    const simulator = simulatorModule.createFakeMoneySubscriptionSimulator({
      accountRepository: {
        setAccountState: setAccountStateSpy
      },
      auditRepository: {
        appendEvent: async () => undefined
      },
      now: () => 1710000002000
    });

    const result = await simulator.simulate({
      tenantContext: { accountId: 'acc-001' },
      accountId: 'acc-001',
      selectedPlan: 'BASIC',
      outcome: 'cancel',
      testMode: true
    });

    expect(setAccountStateSpy).toHaveBeenCalledWith({
      tenantAccountId: 'acc-001',
      accountId: 'acc-001',
      selectedPlan: 'BASIC',
      accountState: 'pending_payment'
    });
    expect(setAccountStateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        accountState: 'enabled'
      })
    );

    expect(result).toEqual({
      accountId: 'acc-001',
      accountState: 'pending_payment',
      nextRoute: 'billing_subscription'
    });
  });

  it('rejects non-test mode to keep fake-money flows explicitly segregated from real billing', async () => {
    const simulatorModule = await loadFakeMoneySimulatorModule();

    const simulator = simulatorModule.createFakeMoneySubscriptionSimulator({
      accountRepository: {
        setAccountState: async () => undefined
      },
      auditRepository: {
        appendEvent: async () => undefined
      }
    });

    await expect(
      simulator.simulate({
        tenantContext: { accountId: 'acc-001' },
        accountId: 'acc-001',
        selectedPlan: 'PRO',
        outcome: 'success',
        testMode: false
      })
    ).rejects.toThrow(/test\s*mode|simulation|segregation|required/i);
  });
});
