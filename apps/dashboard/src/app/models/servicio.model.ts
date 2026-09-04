// Servicio - Entity Model
export interface Servicio {
  id: string;
  nombre: string;
  descripcion?: string;
  categoria: string;
  duracionMinutos: number;
  precio: number;
  depositPercent: number;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateServicioDTO = Omit<Servicio, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateServicioDTO = Partial<CreateServicioDTO>;

// Catálogo de servicios aprobado por negocio. Mantener etiquetas y orden.
export const SERVICIOS_POR_CATEGORIA = {
  'Barbería': [
    'Corte de cabello',
    'Corte + barba',
    'Arreglo de barba',
    'Afeitado clásico',
    'Perfilado de cejas',
    'Coloración de cabello',
    'Coloración de barba',
    'Tratamiento capilar',
    'Lavado y peinado'
  ],
  'Peluquería': [
    'Corte mujer',
    'Corte hombre',
    'Lavado',
    'Peinado',
    'Brushing',
    'Coloración',
    'Mechas/Balayage',
    'Alisado',
    'Keratina',
    'Tratamientos capilares'
  ],
  'Uñas': [
    'Manicura',
    'Pedicura',
    'Esmaltado tradicional',
    'Esmaltado semipermanente',
    'Kapping',
    'Uñas gel',
    'Uñas acrílicas',
    'Nail Art',
    'Retiro de producto',
    'Reparación de uñas'
  ],
  'Pestañas y Cejas': [
    'Extensiones de pestañas',
    'Lifting de pestañas',
    'Permanente de pestañas',
    'Tinte de pestañas',
    'Perfilado de cejas',
    'Diseño de cejas',
    'Laminado de cejas'
  ],
  'Depilación': [
    'Cera facial',
    'Cera corporal',
    'Axilas',
    'Piernas',
    'Ingles',
    'Depilación con hilo',
    'Depilación láser'
  ],
  'Estética Facial': [
    'Limpieza facial',
    'Hidratación facial',
    'Antiacné',
    'Dermaplaning',
    'Peeling',
    'Rejuvenecimiento facial',
    'Tratamientos antimanchas'
  ],
  'Estética Corporal': [
    'Drenaje linfático',
    'Radiofrecuencia',
    'Presoterapia',
    'Cavitación',
    'Maderoterapia',
    'Exfoliación corporal',
    'Hidratación corporal',
    'Tonificación corporal'
  ],
  'Masajes': [
    'Relajante',
    'Descontracturante',
    'Deportivo',
    'Antiestrés',
    'Reflexología',
    'Drenaje linfático'
  ],
  'Maquillaje': [
    'Social',
    'Novias',
    'Eventos',
    'Quinceaños',
    'Producción fotográfica'
  ],
  'Spa / Bienestar': [
    'Circuito spa',
    'Masajes',
    'Tratamientos faciales',
    'Exfoliación corporal',
    'Hidroterapia',
    'Sauna',
    'Relax day'
  ]
} as const;

// Categorías de servicios
export const CATEGORIAS_SERVICIOS = Object.keys(SERVICIOS_POR_CATEGORIA) as Array<keyof typeof SERVICIOS_POR_CATEGORIA>;

export type CategoriaServicio = typeof CATEGORIAS_SERVICIOS[number];
