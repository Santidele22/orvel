/**
 * Business configuration and template visibility rules.
 * Pure functions for business settings and template filtering.
 */

export type BusinessSettingsState = {
  businessId: string;
  businessName: string;
  updatedAt: string;
};

export type UserBusiness = {
  id: string;
  name: string;
};

export type TemplateOption = {
  id: string;
  businessId: string;
  label: string;
};

export type UpdateBusinessNameInput = {
  state: BusinessSettingsState;
  nextBusinessName: string;
  persistedAt: string;
};

export type GetVisibleTemplatesInput = {
  userBusinesses: UserBusiness[];
  selectedBusinessId: string | null;
  templates: TemplateOption[];
};

/**
 * Updates the business name with trimmed value and updates the updatedAt timestamp.
 * Returns a new state object with the trimmed name and new timestamp.
 */
export function updateBusinessName(input: UpdateBusinessNameInput): BusinessSettingsState {
  const { state, nextBusinessName, persistedAt } = input;
  return {
    ...state,
    businessName: nextBusinessName.trim(),
    updatedAt: persistedAt
  };
}

/**
 * Filters templates to only show those belonging to the selected business.
 * If no business is selected or user has no businesses, returns empty array.
 */
export function getVisibleTemplates(input: GetVisibleTemplatesInput): TemplateOption[] {
  const { userBusinesses, selectedBusinessId, templates } = input;

  // If no business is selected or no businesses, return empty
  if (!selectedBusinessId || userBusinesses.length === 0) {
    return [];
  }

  // Filter templates to only show those matching the selected business
  return templates.filter(
    (template) => template.businessId === selectedBusinessId
  );
}
