// Turno - Entity Model
export interface Turno {
  id: string;
  clienteId: string;
  servicioId: string;
  fecha: Date;
  hora: string; // HH:mm format
  duracionMinutos: number;
  estado: TurnoEstado;
  notas?: string;
  precio: number;
  createdAt: Date;
  updatedAt: Date;
}

export type TurnoEstado = 'confirmado' | 'en-proceso' | 'completado' | 'cancelado' | 'no-asistio';

export type CreateTurnoDTO = Omit<Turno, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateTurnoDTO = Partial<CreateTurnoDTO>;
export type FiltrarTurnoDTO = {
  fecha?: Date;
  estado?: TurnoEstado;
  clienteId?: string;
};

import { Cliente } from './cliente.model';
import { Servicio } from './servicio.model';

export interface TurnoWithRelations extends Turno {
  clienteNombre: string;
  servicioNombre: string;
  cliente?: Cliente;
  servicio?: Servicio;
}