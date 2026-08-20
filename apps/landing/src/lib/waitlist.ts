import { z } from 'zod';

import { ARGENTINA_AREA_CODES } from './argentina-area-codes';

export const WAITLIST_RUBROS = ['barberia', 'unas', 'peluqueria', 'masajes', 'otro'] as const;
export type WaitlistRubro = (typeof WAITLIST_RUBROS)[number];

export const EARLY_BIRD_TIERS = [
  { slots: 10, discountPercent: 50, discountLabel: '50%' },
  { slots: 15, discountPercent: 25, discountLabel: '25%' },
  { slots: 25, discountPercent: 10, discountLabel: '10%' }
] as const;

export const EARLY_BIRD_TOTAL_SLOTS = 50;
export const EARLY_BIRD_OCCUPIED = 0;

export const WAITLIST_PERSISTENCE_UNAVAILABLE = 'persistence_unavailable';

export type CurrentFranja = {
  discountPercent: number | null;
  discountLabel: string | null;
  remainingInTier: number;
  tierSlots: number;
  remainingTotal: number;
  inBenefit: boolean;
};

export type WaitlistField = 'name' | 'email' | 'whatsapp' | 'rubro';

export type WaitlistInput = Partial<Record<WaitlistField, unknown>>;

export type ValidWaitlist = {
  name: string;
  email: string;
  whatsapp: string;
  rubro: WaitlistRubro;
  normalizedWhatsapp: string;
};

export type WaitlistFieldErrors = Partial<Record<WaitlistField, string>>;

export type WaitlistValidationResult =
  | { success: true; data: ValidWaitlist }
  | { success: false; fieldErrors: WaitlistFieldErrors };

const argentinaAreaCodes = [...ARGENTINA_AREA_CODES].sort((left, right) => right.length - left.length);

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function isValidLocalNumber(areaCode: string, localNumber: string): boolean {
  if (localNumber.startsWith('15')) return false;
  if (areaCode === '294') return /^\d{6,7}$/.test(localNumber);
  return /^\d{6,8}$/.test(localNumber);
}

export function normalizeArgentinaWhatsapp(raw: string): string | null {
  let digits = digitsOnly(raw);
  if (!digits) return null;

  if (digits.startsWith('54')) digits = digits.slice(2);
  if (digits.startsWith('9') && digits.length >= 11) digits = digits.slice(1);
  if (digits.startsWith('0')) digits = digits.slice(1);

  for (const areaCode of argentinaAreaCodes) {
    if (!digits.startsWith(areaCode)) continue;
    const localNumber = digits.slice(areaCode.length);
    if (!isValidLocalNumber(areaCode, localNumber)) continue;
    return `+54${areaCode}${localNumber}`;
  }

  return null;
}

export function getCurrentFranja(occupied: number): CurrentFranja {
  const safeOccupied = Number.isFinite(occupied) ? Math.max(0, Math.floor(occupied)) : 0;
  const remainingTotal = Math.max(0, EARLY_BIRD_TOTAL_SLOTS - safeOccupied);
  let cursor = 0;

  for (const tier of EARLY_BIRD_TIERS) {
    const start = cursor;
    const end = cursor + tier.slots;
    const takenInTier = Math.max(0, Math.min(safeOccupied, end) - start);
    const remainingInTier = tier.slots - takenInTier;
    if (remainingInTier > 0) {
      return {
        discountPercent: tier.discountPercent,
        discountLabel: tier.discountLabel,
        remainingInTier,
        tierSlots: tier.slots,
        remainingTotal,
        inBenefit: true
      };
    }
    cursor = end;
  }

  return {
    discountPercent: null,
    discountLabel: null,
    remainingInTier: 0,
    tierSlots: 0,
    remainingTotal,
    inBenefit: false
  };
}

export type WaitlistOffer = {
  position: number;
  inBenefit: boolean;
  discountPercent: number | null;
  discountLabel: string | null;
};

export function getOfferForPosition(position: number): WaitlistOffer {
  const safePosition = Number.isFinite(position) ? Math.max(1, Math.floor(position)) : 1;
  const franja = getCurrentFranja(safePosition - 1);
  return {
    position: safePosition,
    inBenefit: franja.inBenefit,
    discountPercent: franja.discountPercent,
    discountLabel: franja.discountLabel
  };
}

export function waitlistOfferCopy(offer: WaitlistOffer | null | undefined): string {
  if (offer?.inBenefit && offer.discountLabel) {
    return `Entraste en la franja de ${offer.discountLabel} OFF el primer mes de Premium.`;
  }
  if (offer && !offer.inBenefit) {
    return 'Estás en la lista. Los 50 con descuento ya se completaron; te avisamos al abrir.';
  }
  return 'Te avisamos al abrir.';
}

const waitlistSchema = z.object({
  name: z.string(),
  email: z.string(),
  whatsapp: z.string(),
  rubro: z.string()
});

export function validateWaitlist(input: WaitlistInput | unknown): WaitlistValidationResult {
  const parsed = waitlistSchema.safeParse({
    name: typeof (input as WaitlistInput)?.name === 'string' ? (input as WaitlistInput).name : '',
    email: typeof (input as WaitlistInput)?.email === 'string' ? (input as WaitlistInput).email : '',
    whatsapp: typeof (input as WaitlistInput)?.whatsapp === 'string' ? (input as WaitlistInput).whatsapp : '',
    rubro: typeof (input as WaitlistInput)?.rubro === 'string' ? (input as WaitlistInput).rubro : ''
  });

  const values = parsed.success
    ? {
        name: parsed.data.name.trim(),
        email: parsed.data.email.trim(),
        whatsapp: parsed.data.whatsapp.trim(),
        rubro: parsed.data.rubro.trim()
      }
    : { name: '', email: '', whatsapp: '', rubro: '' };

  const fieldErrors: WaitlistFieldErrors = {};

  if (!values.name) fieldErrors.name = 'El nombre es requerido';
  else if (values.name.length < 2) fieldErrors.name = 'El nombre debe tener al menos 2 caracteres';

  if (!values.email) fieldErrors.email = 'El email es requerido';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) fieldErrors.email = 'Ingresá un email válido';

  const normalizedWhatsapp = normalizeArgentinaWhatsapp(values.whatsapp);
  if (!values.whatsapp) fieldErrors.whatsapp = 'El WhatsApp es requerido';
  else if (!normalizedWhatsapp) fieldErrors.whatsapp = 'Ingresá un WhatsApp argentino válido';

  if (!values.rubro) fieldErrors.rubro = 'Seleccioná tu rubro';
  else if (!WAITLIST_RUBROS.includes(values.rubro as WaitlistRubro)) {
    fieldErrors.rubro = 'Seleccioná un rubro válido';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors };
  }

  return {
    success: true,
    data: {
      name: values.name,
      email: values.email,
      whatsapp: values.whatsapp,
      rubro: values.rubro as WaitlistRubro,
      normalizedWhatsapp: normalizedWhatsapp as string
    }
  };
}
