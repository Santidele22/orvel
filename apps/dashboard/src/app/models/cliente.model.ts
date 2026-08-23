// Re-export shim for the @orvel/types migration window.
// Source moved to packages/types/src/cliente.model.ts (chore-extract-types-package).
// Deletable once no importer references this old path.
export type {
  Cliente,
  CreateClienteDTO,
  UpdateClienteDTO,
} from '@orvel/types';
