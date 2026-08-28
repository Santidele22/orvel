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
