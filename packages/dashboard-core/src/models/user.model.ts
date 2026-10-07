// Re-export shim for the @orvel/types migration window.
// Source moved to packages/types/src/user.model.ts (chore-extract-types-package).
// Deletable once no importer references this old path.
export {
  NEGOCIO_TEMPLATES,
  type User,
  type TipoNegocio,
  type UserPlan,
  type AuthUser,
  type LoginDTO,
  type RegisterDTO,
} from '@orvel/types';
