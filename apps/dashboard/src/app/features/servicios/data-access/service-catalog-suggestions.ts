import { SERVICIOS_POR_CATEGORIA, type Servicio } from '../../../models/servicio.model';
import { sanitizeSelectedRubros, type RequiredRubro } from '../../onboarding/data-access/onboarding-rubros';

export type SuggestedService = Omit<Servicio, 'createdAt' | 'updatedAt'> & {
  source: 'suggested';
  rubro: RequiredRubro;
  createdAt: Date;
  updatedAt: Date;
};

const RUBRO_CATEGORIES: Record<RequiredRubro, Array<keyof typeof SERVICIOS_POR_CATEGORIA>> = {
  peluqueria: ['Peluquería'],
  unas: ['Uñas'],
  barberia: ['Barbería'],
  spa: ['Spa / Bienestar', 'Estética Facial', 'Estética Corporal'],
  pestanas: ['Pestañas y Cejas'],
  cejas: ['Pestañas y Cejas'],
  masajes: ['Masajes'],
  otro: ['Peluquería', 'Uñas', 'Barbería']
};

function normalizeComparable(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function serviceKey(service: Pick<Servicio, 'nombre' | 'categoria'>): string {
  return `${normalizeComparable(service.nombre)}::${normalizeComparable(service.categoria)}`;
}

function estimateCatalogDuration(nombre: string): number {
  const normalized = normalizeComparable(nombre);
  if (normalized.includes('extensiones') || normalized.includes('unas acrilicas') || normalized.includes('unas gel')) return 90;
  if (normalized.includes('lifting') || normalized.includes('masaje') || normalized.includes('tratamiento')) return 60;
  if (normalized.includes('retiro') || normalized.includes('lavado')) return 30;
  return 45;
}

export function getSuggestedServicesForRubros(rubros: unknown): SuggestedService[] {
  const selectedRubros = sanitizeSelectedRubros(rubros);
  const createdAt = new Date('2024-01-01T00:00:00.000Z');
  const seen = new Set<string>();

  return selectedRubros.flatMap((rubro) =>
    RUBRO_CATEGORIES[rubro].flatMap((categoria) =>
      SERVICIOS_POR_CATEGORIA[categoria].map((nombre, index): SuggestedService | null => {
        const suggested: SuggestedService = {
          id: `suggested-${rubro}-${normalizeComparable(categoria).replace(/[^a-z0-9]+/g, '-')}-${index + 1}`,
          nombre,
          descripcion: `Sugerencia para ${categoria}`,
          categoria,
          duracionMinutos: estimateCatalogDuration(nombre),
          precio: 0,
          depositPercent: 0,
          activo: true,
          source: 'suggested',
          rubro,
          createdAt,
          updatedAt: createdAt
        };

        const key = serviceKey(suggested);
        if (seen.has(key)) {
          return null;
        }
        seen.add(key);
        return suggested;
      })
    )
  ).filter((service): service is SuggestedService => service !== null);
}

export function mergeSuggestedWithExistingServices(input: {
  selectedRubros: unknown;
  existingServices: Array<Pick<Servicio, 'nombre' | 'categoria'>>;
}): Array<SuggestedService | Pick<Servicio, 'nombre' | 'categoria'>> {
  const existingKeys = new Set(input.existingServices.map(serviceKey));
  const suggestions = getSuggestedServicesForRubros(input.selectedRubros).filter(
    (suggestion) => !existingKeys.has(serviceKey(suggestion))
  );

  return [...input.existingServices, ...suggestions];
}
