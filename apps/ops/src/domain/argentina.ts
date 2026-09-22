import { normalizePhoneForWhatsApp } from './phone';

const FOREIGN_CALLING_PREFIXES = ['56', '598', '595', '591', '55', '51', '57', '593', '52'];

const FOREIGN_COUNTRIES =
  /\b(chile|uruguay|paraguay|bolivia|brasil|brazil|peru|perú|colombia|ecuador|mexico|méxico|usa|united states)\b/i;

const ARGENTINA_COUNTRY = /\bargentina\b/i;

const ARGENTINA_PROVINCES =
  /\b(buenos aires|caba|capital federal|córdoba|cordoba|mendoza|río negro|rio negro|neuquén|neuquen|chubut|santa cruz|tierra del fuego|misiones|corrientes|entre ríos|entre rios|santa fe|la pampa|san luis|san juan|la rioja|catamarca|tucumán|tucuman|salta|jujuy|formosa|chaco|santiago del estero)\b/i;

export function isArgentinaProspect(input: { address: string; phoneRaw: string; city?: string }): boolean {
  const digits = input.phoneRaw.replace(/\D/g, '').replace(/^00/, '');
  if (hasForeignCallingCode(digits)) {
    return false;
  }
  const place = `${input.address} ${input.city ?? ''}`;
  if (FOREIGN_COUNTRIES.test(place) && !ARGENTINA_COUNTRY.test(place)) {
    return false;
  }
  if (digits.startsWith('54') || ARGENTINA_COUNTRY.test(place) || ARGENTINA_PROVINCES.test(place)) {
    return normalizePhoneForWhatsApp(input.phoneRaw) !== null;
  }
  return false;
}

export function extractCityFromAddress(address: string): string {
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return '';
  }
  const withoutCountry = ARGENTINA_COUNTRY.test(parts[parts.length - 1] ?? '') ? parts.slice(0, -1) : parts;
  if (withoutCountry.length === 0) {
    return '';
  }
  const last = withoutCountry[withoutCountry.length - 1] ?? '';
  const withoutProvince = ARGENTINA_PROVINCES.test(last) ? withoutCountry.slice(0, -1) : withoutCountry;
  return withoutProvince[withoutProvince.length - 1] ?? '';
}

function hasForeignCallingCode(digits: string): boolean {
  if (digits.startsWith('54')) {
    return false;
  }
  return FOREIGN_CALLING_PREFIXES.some((prefix) => digits.startsWith(prefix));
}
