// @orvel/types public surface barrel.
// Type-only dashboard models; see packages/types/README.md.

export {
  SAME_CATEGORY_BRANCH_SCOPE_EXAMPLE,
  type Branch,
  type CreateBranchDTO,
} from './branch.model';

export type {
  Business,
  WeekdayKey,
  WorkingDayHours,
  BusinessSettings,
  BusinessPublicView,
} from './business.model';

export type {
  Cliente,
  CreateClienteDTO,
  UpdateClienteDTO,
} from './cliente.model';

export {
  NEGOCIO_TEMPLATES,
  type User,
  type TipoNegocio,
  type UserPlan,
  type AuthUser,
  type LoginDTO,
  type RegisterDTO,
} from './user.model';
