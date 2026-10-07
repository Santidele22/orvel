/**
 * Fase 4 of #1098 / ADR 0012 — one session key per execution target.
 *
 * The three surfaces are being split onto their own origins, and each target owns the session it
 * keeps. A single shared key was the mechanical half of audit finding S2: an XSS on the landing
 * origin could read the app's refresh token because both lived under `orvel.supabase.auth`.
 */

export type OrvelAuthStorageTarget = 'pwa' | 'web';

/**
 * The `pwa` value is deliberately the historical literal. That target is deployed today with
 * installed clients holding a session under it, so renaming it would log every one of them out for
 * no gain. The `web` target is not deployed yet, so it takes its own key from the start.
 */
const AUTH_STORAGE_KEYS: Record<OrvelAuthStorageTarget, string> = {
  pwa: 'orvel.supabase.auth',
  web: 'orvel.supabase.auth.web'
};

/** The Web Storage key that holds the session of `target`. */
export function resolveAuthStorageKey(target: OrvelAuthStorageTarget): string {
  return AUTH_STORAGE_KEYS[target];
}

/**
 * @deprecated Use `resolveAuthStorageKey(target)` instead. This is the **pwa** target's key; a
 * target that imports it is claiming the pwa's session, which is how the landing and the app ended
 * up sharing one (S2). It stays only until the split retires it (step 4 of ADR 0012).
 */
export const ORVEL_SUPABASE_AUTH_STORAGE_KEY = AUTH_STORAGE_KEYS.pwa;
