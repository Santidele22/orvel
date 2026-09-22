export const CONTACT_CATEGORIES = [
  'peluqueria',
  'estetica',
  'spa',
  'barberia',
  'unas',
  'otro'
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ContactCategory, string> = {
  peluqueria: 'Peluquería',
  estetica: 'Estética',
  spa: 'Spa',
  barberia: 'Barbería',
  unas: 'Uñas',
  otro: 'Otro'
};

const CATEGORY_ALIASES: Record<string, ContactCategory> = {
  peluqueria: 'peluqueria',
  peluquería: 'peluqueria',
  estetica: 'estetica',
  estética: 'estetica',
  spa: 'spa',
  barberia: 'barberia',
  barbería: 'barberia',
  unas: 'unas',
  uñas: 'unas',
  otro: 'otro',
  'hair salon': 'peluqueria',
  'beauty salon': 'estetica',
  'nail salon': 'unas',
  'barber shop': 'barberia',
  'barbershop': 'barberia',
  peluquero: 'peluqueria',
  'salón de belleza': 'estetica',
  'salon de belleza': 'estetica'
};

export function parseCategory(raw: string | undefined): ContactCategory {
  if (!raw) {
    return 'otro';
  }
  const key = raw.trim().toLowerCase();
  return CATEGORY_ALIASES[key] ?? 'otro';
}
