// Servicio - Entity Model
export interface Servicio {
  id: string;
  nombre: string;
  descripcion?: string;
  categoria: string;
  duracionMinutos: number;
  precio: number;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateServicioDTO = Omit<Servicio, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateServicioDTO = Partial<CreateServicioDTO>;

// Categorías de servicios
export const CATEGORIAS_SERVICIOS = [
  'Uñas',
  'Pestañas',
  'Cejas',
  'Peluquería',
  'Barbería',
  'Maquillaje',
  'Masajes',
  'Tratamientos',
  'Otro'
] as const;

export type CategoriaServicio = typeof CATEGORIAS_SERVICIOS[number];