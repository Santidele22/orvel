import { describe, expect, it } from 'vitest';

type TenantContext = {
  accountId: string;
};

type SalonRecord = {
  id: string;
  accountId: string;
  name: string;
};

type TenantSalonBoundaryModule = {
  createTenantSafeSalonService: (deps: {
    repository: {
      listByAccountId: (accountId: string) => Promise<SalonRecord[]>;
      createForAccount: (input: { accountId: string; name: string }) => Promise<SalonRecord>;
      getById: (id: string) => Promise<SalonRecord | null>;
      updateName: (input: { id: string; name: string }) => Promise<SalonRecord | null>;
    };
  }) => {
    listSalons: (ctx: TenantContext) => Promise<SalonRecord[]>;
    createSalon: (ctx: TenantContext, input: { name: string }) => Promise<SalonRecord>;
    getSalonById: (ctx: TenantContext, salonId: string) => Promise<SalonRecord | null>;
    renameSalon: (ctx: TenantContext, input: { salonId: string; name: string }) => Promise<SalonRecord | null>;
  };
};

async function loadTenantSafetyModule(): Promise<TenantSalonBoundaryModule> {
  try {
    const mod = await import('../../core/tenancy/tenant-safe-salon.service');
    return mod as TenantSalonBoundaryModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/tenancy/tenant-safe-salon.service.ts exporting createTenantSafeSalonService({ repository }).'
    );
  }
}

describe('SB-02 RED contract: tenant safety at service/repository boundary', () => {
  it('requires tenant/account context for all operations', async () => {
    const tenantBoundary = await loadTenantSafetyModule();

    const service = tenantBoundary.createTenantSafeSalonService({
      repository: {
        listByAccountId: async () => [],
        createForAccount: async ({ accountId, name }) => ({ id: 'sal-001', accountId, name }),
        getById: async () => null,
        updateName: async () => null
      }
    });

    await expect(service.listSalons({ accountId: '' })).rejects.toThrow(/tenant|account|context|required/i);
    await expect(service.createSalon({ accountId: '' }, { name: 'Main' })).rejects.toThrow(/tenant|account|context|required/i);
    await expect(service.getSalonById({ accountId: '' }, 'sal-001')).rejects.toThrow(/tenant|account|context|required/i);
    await expect(service.renameSalon({ accountId: '' }, { salonId: 'sal-001', name: 'Renamed' })).rejects.toThrow(
      /tenant|account|context|required/i
    );
  });

  it('cannot read or mutate salons from another tenant using foreign IDs', async () => {
    const tenantBoundary = await loadTenantSafetyModule();

    const rows: SalonRecord[] = [
      { id: 'sal-a-001', accountId: 'acc-A', name: 'A Main' },
      { id: 'sal-b-001', accountId: 'acc-B', name: 'B Main' }
    ];

    const service = tenantBoundary.createTenantSafeSalonService({
      repository: {
        listByAccountId: async (accountId) => rows.filter((row) => row.accountId === accountId),
        createForAccount: async ({ accountId, name }) => {
          const created = {
            id: `sal-${accountId}-new`,
            accountId,
            name
          };
          rows.push(created);
          return created;
        },
        getById: async (id) => rows.find((row) => row.id === id) ?? null,
        updateName: async ({ id, name }) => {
          const row = rows.find((candidate) => candidate.id === id);
          if (!row) return null;
          row.name = name;
          return row;
        }
      }
    });

    const attackerCtx: TenantContext = { accountId: 'acc-A' };

    await expect(service.getSalonById(attackerCtx, 'sal-b-001')).resolves.toBeNull();
    await expect(service.renameSalon(attackerCtx, { salonId: 'sal-b-001', name: 'hijacked' })).resolves.toBeNull();

    const victimRecord = rows.find((row) => row.id === 'sal-b-001');
    expect(victimRecord?.name).toBe('B Main');
  });
});
