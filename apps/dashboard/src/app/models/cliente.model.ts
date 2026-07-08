// Cliente - Entity Model
// DB-FIX-001: Added soft-delete fields (activo, purgeAt, retentionDays, isActive)
export interface Cliente {
  id: string;
  nombre: string;
  apellido: string;
  telefono: string;
  email?: string;
  notas?: string;
  serviciosFavoritos?: string[]; // IDs de servicios
  
  // DB-FIX-001: Soft delete contract fields
  activo?: boolean;        // Active/inactive status
  active?: boolean;        // Persisted active flag used by legacy customer rows
  isActive?: boolean;    // Alternative active flag
  status?: 'active' | 'inactive'; // Status text option
  purgeAt?: Date;      // Scheduled purge date for auto-cleanup
  pendingPurge?: boolean; // Flag for pending auto-purge
  retentionDays?: number; // Retention policy in days
  deletionPolicy?: string; // Policy description
  
  createdAt: Date;
  updatedAt: Date;
}

export type CreateClienteDTO = Omit<Cliente, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateClienteDTO = Partial<CreateClienteDTO>;
