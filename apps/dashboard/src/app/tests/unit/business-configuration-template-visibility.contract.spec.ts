import { describe, expect, it } from 'vitest';

type BusinessSettingsState = {
  businessId: string;
  businessName: string;
  updatedAt: string;
};

type UserBusiness = {
  id: string;
  name: string;
};

type TemplateOption = {
  id: string;
  businessId: string;
  label: string;
};

type UpdateBusinessNameFn = (input: {
  state: BusinessSettingsState;
  nextBusinessName: string;
  persistedAt: string;
}) => BusinessSettingsState;

type GetVisibleTemplatesFn = (input: {
  userBusinesses: UserBusiness[];
  selectedBusinessId: string | null;
  templates: TemplateOption[];
}) => TemplateOption[];

async function loadBusinessRulesModule(): Promise<{
  updateBusinessName: UpdateBusinessNameFn;
  getVisibleTemplates: GetVisibleTemplatesFn;
}> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../core/business/business-template-visibility-rules');
  } catch {
    throw new Error(
      'Missing module src/app/core/business/business-template-visibility-rules.ts with updateBusinessName() and getVisibleTemplates().'
    );
  }

  const updateBusinessName = module['updateBusinessName'] as UpdateBusinessNameFn | undefined;
  const getVisibleTemplates = module['getVisibleTemplates'] as GetVisibleTemplatesFn | undefined;

  if (!updateBusinessName || !getVisibleTemplates) {
    throw new Error(
      'Missing exports updateBusinessName(input) and getVisibleTemplates(input) in src/app/core/business/business-template-visibility-rules.ts'
    );
  }

  return { updateBusinessName, getVisibleTemplates };
}

describe('TDD RED contract: business configuration + template visibility rules (mock-only)', () => {
  it('updateBusinessName persists deterministically for same input payload', async () => {
    // TODO(Aurora): implementar regla determinista de persistencia del nombre de negocio (sin Supabase).
    const { updateBusinessName } = await loadBusinessRulesModule();

    const initialState: BusinessSettingsState = {
      businessId: 'biz-spa',
      businessName: 'Atelier Zen',
      updatedAt: 'mock-persisted-v1'
    };

    const input = {
      state: initialState,
      nextBusinessName: '  Atelier Zen Premium  ',
      persistedAt: 'mock-persisted-v2'
    };

    const first = updateBusinessName(input);
    const second = updateBusinessName(input);

    expect(first).toEqual(second);
    expect(first.businessName).toBe('Atelier Zen Premium');
    expect(first.updatedAt).toBe('mock-persisted-v2');
    expect(first.businessId).toBe('biz-spa');
  });

  it('getVisibleTemplates hides unrelated options for single-business users', async () => {
    // TODO(Aurora): ocultar templates/opciones no relacionadas cuando hay un solo negocio.
    const { getVisibleTemplates } = await loadBusinessRulesModule();

    const templates: TemplateOption[] = [
      { id: 'tpl-spa-basic', businessId: 'biz-spa', label: 'Spa Basic' },
      { id: 'tpl-barber-basic', businessId: 'biz-barber', label: 'Barber Basic' }
    ];

    const visible = getVisibleTemplates({
      userBusinesses: [{ id: 'biz-spa', name: 'Spa Norte' }],
      selectedBusinessId: 'biz-spa',
      templates
    });

    expect(visible.map((item) => item.id)).toEqual(['tpl-spa-basic']);
  });

  it('getVisibleTemplates returns only currently selected business templates for multi-business users and updates on switch', async () => {
    // TODO(Aurora): soportar selector por negocio activo y refrescar opciones al cambiar selección.
    const { getVisibleTemplates } = await loadBusinessRulesModule();

    const userBusinesses: UserBusiness[] = [
      { id: 'biz-spa', name: 'Spa Norte' },
      { id: 'biz-barber', name: 'Barber Centro' }
    ];

    const templates: TemplateOption[] = [
      { id: 'tpl-spa-basic', businessId: 'biz-spa', label: 'Spa Basic' },
      { id: 'tpl-spa-plus', businessId: 'biz-spa', label: 'Spa Plus' },
      { id: 'tpl-barber-basic', businessId: 'biz-barber', label: 'Barber Basic' }
    ];

    const visibleForSpa = getVisibleTemplates({
      userBusinesses,
      selectedBusinessId: 'biz-spa',
      templates
    });

    const visibleForBarber = getVisibleTemplates({
      userBusinesses,
      selectedBusinessId: 'biz-barber',
      templates
    });

    expect(visibleForSpa.map((item) => item.id)).toEqual(['tpl-spa-basic', 'tpl-spa-plus']);
    expect(visibleForBarber.map((item) => item.id)).toEqual(['tpl-barber-basic']);
  });
});
