// Re-export shim for the @orvel/types migration window.
// Source moved to packages/types/src/branch.model.ts (chore-extract-types-package).
// Deletable once no importer references this old path.
export {
  SAME_CATEGORY_BRANCH_SCOPE_EXAMPLE,
  type Branch,
  type CreateBranchDTO,
} from '@orvel/types';
