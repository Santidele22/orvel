/**
 * Operator onboarding tour: first-run persistence.
 *
 * The tour opens automatically once per operator and stays reachable from the
 * help button afterwards. Every storage access is defensive: Safari private
 * mode, disabled cookies or SSR must degrade to "show the tour" instead of
 * throwing during shell bootstrap.
 */

export const OPERATOR_TOUR_VERSION = 1;

export const OPERATOR_TOUR_STORAGE_KEY = `orvel.operator-tour.v${OPERATOR_TOUR_VERSION}.completed`;

/** Subset of the Web Storage API the tour needs. Injectable for tests. */
export interface OperatorTourKeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface OperatorTourStorage {
  hasCompleted(): boolean;
  markCompleted(): void;
  reset(): void;
}

function readStore(): OperatorTourKeyValueStore | undefined {
  try {
    if (typeof localStorage === 'undefined') return undefined;
    return localStorage;
  } catch {
    return undefined;
  }
}

export function createOperatorTourStorage(
  store: OperatorTourKeyValueStore | undefined = readStore(),
): OperatorTourStorage {
  return {
    hasCompleted(): boolean {
      try {
        return store?.getItem(OPERATOR_TOUR_STORAGE_KEY) === String(OPERATOR_TOUR_VERSION);
      } catch {
        return false;
      }
    },

    markCompleted(): void {
      try {
        store?.setItem(OPERATOR_TOUR_STORAGE_KEY, String(OPERATOR_TOUR_VERSION));
      } catch {
        // Persisting is best effort; the in-memory signal already ran the tour.
      }
    },

    reset(): void {
      try {
        store?.removeItem(OPERATOR_TOUR_STORAGE_KEY);
      } catch {
        // Ignore: nothing to reset when storage is unavailable.
      }
    },
  };
}
