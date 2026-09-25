export function isStandaloneDisplay(
  displayModeStandalone?: boolean,
  iosStandalone?: boolean,
): boolean {
  const fromMedia =
    displayModeStandalone ??
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches);
  const fromIos =
    iosStandalone ??
    (typeof navigator !== 'undefined' &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  return Boolean(fromMedia || fromIos);
}

function matchesMedia(query: string): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches
  );
}

export function shouldShowBootSplash(
  displayModeStandalone?: boolean,
  iosStandalone?: boolean,
  hoverNonePointerCoarse?: boolean,
  maxWidth1024?: boolean,
): boolean {
  if (isStandaloneDisplay(displayModeStandalone, iosStandalone)) {
    return true;
  }

  const fromCoarse = hoverNonePointerCoarse ?? matchesMedia('(hover: none) and (pointer: coarse)');
  const fromMaxWidth = maxWidth1024 ?? matchesMedia('(max-width: 1024px)');
  return Boolean(fromCoarse || fromMaxWidth);
}

export function isIosDevice(userAgent: string, standalone = false): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return true;
  }
  return standalone && /Macintosh/i.test(userAgent);
}

const IOS_NON_SAFARI_TOKENS =
  /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA\/|Instagram|FBAN|FBAV|FBIOS|Line\/|Twitter|TikTok|Snapchat|WhatsApp|MicroMessenger|Pinterest|LinkedInApp|Musically/i;

export function isIosSafari(userAgent: string, standalone = false): boolean {
  if (!isIosDevice(userAgent, standalone)) {
    return false;
  }
  if (IOS_NON_SAFARI_TOKENS.test(userAgent)) {
    return false;
  }
  return /Version\//i.test(userAgent) && /Safari\//i.test(userAgent);
}

export function iosNonSafariSurfaceName(userAgent: string): string {
  if (/Instagram/i.test(userAgent)) {
    return 'Instagram';
  }
  if (/FBAN|FBAV|FBIOS/i.test(userAgent)) {
    return 'Facebook';
  }
  if (/WhatsApp/i.test(userAgent)) {
    return 'WhatsApp';
  }
  if (/TikTok|Musically/i.test(userAgent)) {
    return 'TikTok';
  }
  if (/Twitter/i.test(userAgent)) {
    return 'X';
  }
  if (/GSA\//i.test(userAgent)) {
    return 'Google';
  }
  if (/CriOS/i.test(userAgent)) {
    return 'Chrome';
  }
  if (/FxiOS/i.test(userAgent)) {
    return 'Firefox';
  }
  if (/EdgiOS/i.test(userAgent)) {
    return 'Edge';
  }
  return 'esta app';
}
