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

export function isIosDevice(userAgent: string, standalone = false): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return true;
  }
  return standalone && /Macintosh/i.test(userAgent);
}
