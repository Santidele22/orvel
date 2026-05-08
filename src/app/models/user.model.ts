// User - Entity Model (for authentication)
export interface User {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  negocioNombre: string;
  tipoNegocio: TipoNegocio;
  telefono?: string;
  avatar?: string;
  plan: UserPlan;
  createdAt: Date;
  updatedAt: Date;
}

export type TipoNegocio = 
  | 'uñas'
  | 'peluqueria'
  | 'barberia'
  | 'spa'
  | 'pestañas'
  | 'cejas'
  | 'masajes'
  | 'otro';

export type UserPlan = 'FREE' | 'STARTER' | 'GROWTH' | 'PRO' | 'free' | 'basic' | 'premium' | 'STARTER' | '';

// Auth types
export interface AuthUser {
  user: User;
  token: string;
}

export type LoginDTO = {
  email: string;
  password: string;
};

export type RegisterDTO = {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  negocioNombre: string;
  tipoNegocio: TipoNegocio;
  telefono?: string;
};

// Template de negocio para onboarding
export const NEGOCIO_TEMPLATES: Record<TipoNegocio, { serviciosDefault: string[]; categorias: string[] }> = {
  'uñas': {
    serviciosDefault: ['Manicura', 'Esmaltado Semipermanente', 'Uñas Acrílicas', 'Uñas Gel', 'Retiro de Esmalte'],
    categorias: ['Uñas']
  },
  'peluqueria': {
    serviciosDefault: ['Corte', 'Peinado', 'Tintura', 'Alisado', 'Tratamiento'],
    categorias: ['Corte', 'Coloración', 'Tratamientos']
  },
  'barberia': {
    serviciosDefault: ['Corte de Cabello', 'Arreglo de Barba', 'Afeitado', 'Cejas'],
    categorias: ['Corte', 'Barba']
  },
  'spa': {
    serviciosDefault: ['Masaje Relajante', 'Masaje Terapeútico', 'Tratamiento Facial', 'Wrap Corporal'],
    categorias: ['Masajes', 'Tratamientos', 'Faciales']
  },
  'pestañas': {
    serviciosDefault: ['Extensiones de Pestañas', 'Lifting de Pestañas', 'Relleno de Pestañas', 'Botox de Pestañas'],
    categorias: ['Pestañas']
  },
  'cejas': {
    serviciosDefault: ['Diseño de Cejas', 'Cejas Microblading', 'Depilación de Cejas', 'Maquillaje de Cejas'],
    categorias: ['Cejas', 'Maquillaje']
  },
  'masajes': {
    serviciosDefault: ['Masaje Relajante', 'Masaje Deportivo', 'Masaje Terapeútico', 'Drenaje Linfático'],
    categorias: ['Masajes']
  },
  'otro': {
    serviciosDefault: [],
    categorias: ['General']
  }
};
