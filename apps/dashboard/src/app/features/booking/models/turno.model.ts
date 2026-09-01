// Turno - Entity Model
// Branch scope keeps appointments isolated for same category branches,
// e.g. branch-barberia-a and branch-barberia-b can both use rubro='barberia'.
export interface Turno {
  id: string;
  branchId?: string;
  clienteId: string;
  servicioId: string;
  fecha: Date;
  hora: string; // HH:mm format
  duracionMinutos: number;
  estado: TurnoEstado;
  notas?: string;
  precio: number;
  professionalId?: string;
  professionalNombre?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TurnoEstado = 'pendiente' | 'confirmado' | 'en-proceso' | 'completado' | 'cancelado' | 'no-asistio';

export type CreateTurnoDTO = Omit<Turno, 'id' | 'createdAt' | 'updatedAt'> & {
  walkInName?: string;
};
export type UpdateTurnoDTO = Partial<CreateTurnoDTO>;
export type FiltrarTurnoDTO = {
  branchId?: string;
  fecha?: Date;
  estado?: TurnoEstado;
  clienteId?: string;
};

import { Cliente } from '../../../models/cliente.model';
import { Servicio } from '../../../models/servicio.model';

export interface TurnoWithRelations extends Turno {
  clienteNombre: string;
  servicioNombre: string;
  cliente?: Cliente;
  servicio?: Servicio;
}
