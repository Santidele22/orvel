/**
 * Best-effort AR mobile normalization for wa.me.
 * Maps scrapes are messy; the contact card remains the correction path.
 */
export function normalizePhoneForWhatsApp(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('54')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('9') && digits.length >= 10) {
    digits = digits.slice(1);
  }
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  digits = stripMobileFifteen(digits);
  if (digits.length < 8 || digits.length > 11) {
    return null;
  }
  return `549${digits}`;
}

function stripMobileFifteen(national: string): string {
  for (const areaLength of [4, 3, 2]) {
    if (national.length <= areaLength + 2) {
      continue;
    }
    const area = national.slice(0, areaLength);
    const rest = national.slice(areaLength);
    if (!rest.startsWith('15')) {
      continue;
    }
    const subscriber = rest.slice(2);
    if (subscriber.length >= 6 && subscriber.length <= 8) {
      return `${area}${subscriber}`;
    }
  }
  return national;
}
