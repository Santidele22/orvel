const JWT_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const BEARER_AUTHORIZATION_PATTERN = /^Bearer\s+(.+)$/i;

export function isJwtShapedSupabaseKey(value: string | null | undefined): boolean {
  const key = value?.trim();
  if (!key) return false;

  const segments = key.split('.');
  return segments.length === 3 && segments.every((segment) => JWT_SEGMENT_PATTERN.test(segment));
}

export function appendSupabaseAuthorizationHeader(
  headers: Record<string, string>,
  inboundAuthorization: string | null | undefined,
  supabasePublicKey: string,
): void {
  const authorization = inboundAuthorization?.trim();
  if (authorization) {
    const bearerToken = authorization.match(BEARER_AUTHORIZATION_PATTERN)?.[1]?.trim();
    if (isJwtShapedSupabaseKey(bearerToken)) {
      headers.Authorization = authorization;
    }
    return;
  }

  if (isJwtShapedSupabaseKey(supabasePublicKey)) {
    headers.Authorization = `Bearer ${supabasePublicKey}`;
  }
}
