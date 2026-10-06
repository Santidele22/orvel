import { AUTH_PRESENCE_KEY } from './browser-storage-keys';

export { AUTH_PRESENCE_KEY };

/**
 * How long the hint stays useful. It bounds staleness (a sign-out in the app
 * cannot clear a key that lives on the landing origin), and a stale hint costs one
 * redirect, because the destination still enforces auth.
 */
export const AUTH_PRESENCE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Record that this browser completed a sign-in on the landing origin.
 *
 * Only a timestamp is stored. The session itself lives in memory for the length of
 * the redirect and travels to the app inside the encrypted handoff; keeping a
 * durable copy here is audit finding S2.
 */
export function markAuthPresent(): void {
  const target = storage();
  if (!target) return;

  try {
    target.setItem(AUTH_PRESENCE_KEY, JSON.stringify({ at: Date.now() }));
  } catch {
    // A full or blocked storage must not break a sign-in that already succeeded.
  }
}

/** Whether this browser signed in recently enough for the hint to still apply. */
export function isAuthPresent(): boolean {
  const target = storage();
  if (!target) return false;

  try {
    const raw = target.getItem(AUTH_PRESENCE_KEY);
    if (!raw) return false;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return false;

    const at = (parsed as { at?: unknown }).at;
    if (typeof at !== 'number' || !Number.isFinite(at)) return false;

    const age = Date.now() - at;
    if (age < 0) return false;

    return age <= AUTH_PRESENCE_MAX_AGE_MS;
  } catch {
    return false;
  }
}
