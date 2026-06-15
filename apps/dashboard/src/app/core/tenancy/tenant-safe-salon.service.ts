export type TenantContext = {
  accountId: string;
};

export type SalonRecord = {
  id: string;
  accountId: string;
  name: string;
};

function assertTenantAccountId(ctx: TenantContext): string {
  const accountId = typeof ctx?.accountId === 'string' ? ctx.accountId.trim() : '';

  if (!accountId) {
    throw new Error('Tenant account context is required.');
  }

  return accountId;
}

export function createTenantSafeSalonService(_deps: {
  repository: {
    listByAccountId: (accountId: string) => Promise<SalonRecord[]>;
    createForAccount: (input: { accountId: string; name: string }) => Promise<SalonRecord>;
    getById: (id: string) => Promise<SalonRecord | null>;
    updateName: (input: { id: string; name: string }) => Promise<SalonRecord | null>;
  };
}): {
  listSalons: (ctx: TenantContext) => Promise<SalonRecord[]>;
  createSalon: (ctx: TenantContext, input: { name: string }) => Promise<SalonRecord>;
  getSalonById: (ctx: TenantContext, salonId: string) => Promise<SalonRecord | null>;
  renameSalon: (ctx: TenantContext, input: { salonId: string; name: string }) => Promise<SalonRecord | null>;
} {
  return {
    async listSalons(ctx) {
      const accountId = assertTenantAccountId(ctx);
      return _deps.repository.listByAccountId(accountId);
    },
    async createSalon(ctx, input) {
      const accountId = assertTenantAccountId(ctx);
      return _deps.repository.createForAccount({ accountId, name: input.name });
    },
    async getSalonById(ctx, salonId) {
      const accountId = assertTenantAccountId(ctx);
      const salon = await _deps.repository.getById(salonId);

      if (!salon || salon.accountId !== accountId) {
        return null;
      }

      return salon;
    },
    async renameSalon(ctx, input) {
      const accountId = assertTenantAccountId(ctx);
      const current = await _deps.repository.getById(input.salonId);

      if (!current || current.accountId !== accountId) {
        return null;
      }

      return _deps.repository.updateName({ id: input.salonId, name: input.name });
    }
  };
}
