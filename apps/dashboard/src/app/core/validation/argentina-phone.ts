/**
 * Argentina numbering after stripping +54 / 9 / 0:
 * CABA 11 + 8 subscriber (optional legacy 15),
 * interior area 2–4 + subscriber 6–8 (8–12 national digits).
 */
export function isValidArgentinaPhone(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;

  if (!/^[+\d\s\-()]+$/.test(raw)) {
    return false;
  }

  if (raw.startsWith('+') && !raw.startsWith('+54')) {
    return false;
  }

  if (/^\+54\s*0/.test(raw)) {
    return false;
  }

  let digits = raw.replace(/\D/g, '');
  if (!digits) return false;

  if (digits.startsWith('54')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('9')) {
    digits = digits.slice(1);
  }

  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.startsWith('11')) {
    let subscriber = digits.slice(2);
    if (subscriber.startsWith('15')) {
      subscriber = subscriber.slice(2);
    }

    return subscriber.length === 8;
  }

  for (const areaLen of [3, 4]) {
    if (digits.length > areaLen + 2 && digits.slice(areaLen, areaLen + 2) === '15') {
      digits = digits.slice(0, areaLen) + digits.slice(areaLen + 2);
      break;
    }
  }

  if (digits.length < 8 || digits.length > 12) {
    return false;
  }

  for (let areaLen = 2; areaLen <= 4; areaLen++) {
    const subscriberLen = digits.length - areaLen;
    if (subscriberLen >= 6 && subscriberLen <= 8) {
      return true;
    }
  }

  return false;
}
