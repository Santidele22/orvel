const PLATFORM_OPERATOR_ROLE = 'platform_operator';

export function isPlatformOperator(appMetadata: unknown): boolean {
  if (!appMetadata || typeof appMetadata !== 'object') {
    return false;
  }

  return (appMetadata as { role?: unknown }).role === PLATFORM_OPERATOR_ROLE;
}
