export interface Branch {
  id: string;
  businessId: string;
  displayName: string;
  rubro: string;
  address?: string;
  active?: boolean;
}

export type CreateBranchDTO = Omit<Branch, 'id'>;

// Same-category branches are valid: rubro/category classifies a branch,
// it is not a unique business identity.
export const SAME_CATEGORY_BRANCH_SCOPE_EXAMPLE: Branch[] = [
  {
    id: 'branch-barberia-a',
    businessId: 'business-brand-orvel',
    displayName: 'Orvel Barber A',
    rubro: 'barberia'
  },
  {
    id: 'branch-barberia-b',
    businessId: 'business-brand-orvel',
    displayName: 'Orvel Barber B',
    rubro: 'barberia'
  }
];
