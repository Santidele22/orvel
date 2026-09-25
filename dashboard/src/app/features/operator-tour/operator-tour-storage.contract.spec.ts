import { describe, expect, it } from 'vitest';
import {
  OPERATOR_TOUR_STORAGE_KEY,
  OPERATOR_TOUR_VERSION,
  createOperatorTourStorage,
  type OperatorTourKeyValueStore,
} from './operator-tour-storage';

function createMemoryStore(seed: Record<string, string> = {}): OperatorTourKeyValueStore & {
  readonly values: Record<string, string>;
} {
  const values: Record<string, string> = { ...seed };

  return {
    values,
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
    removeItem: (key: string) => {
      delete values[key];
    },
  };
}

describe('operator tour storage contract', () => {
  it('namespaces the flag under a versioned orvel key', () => {
    expect(OPERATOR_TOUR_STORAGE_KEY).toBe(`orvel.operator-tour.v${OPERATOR_TOUR_VERSION}.completed`);
    expect(OPERATOR_TOUR_VERSION).toBeGreaterThan(0);
  });

  it('treats a first-time operator as not completed', () => {
    const storage = createOperatorTourStorage(createMemoryStore());

    expect(storage.hasCompleted()).toBe(false);
  });

  it('persists completion so the tour does not re-open on the next visit', () => {
    const store = createMemoryStore();
    const storage = createOperatorTourStorage(store);

    storage.markCompleted();

    expect(storage.hasCompleted()).toBe(true);
    expect(store.values[OPERATOR_TOUR_STORAGE_KEY]).toBe(String(OPERATOR_TOUR_VERSION));
    expect(createOperatorTourStorage(store).hasCompleted()).toBe(true);
  });

  it('re-runs the tour when the stored version is stale', () => {
    const store = createMemoryStore({ [OPERATOR_TOUR_STORAGE_KEY]: '0' });
    const storage = createOperatorTourStorage(store);

    expect(storage.hasCompleted()).toBe(false);
  });

  it('re-runs the tour when the stored value is corrupted', () => {
    const store = createMemoryStore({ [OPERATOR_TOUR_STORAGE_KEY]: 'yes-please' });
    const storage = createOperatorTourStorage(store);

    expect(storage.hasCompleted()).toBe(false);
  });

  it('survives a store that throws (private mode / blocked storage)', () => {
    const throwingStore: OperatorTourKeyValueStore = {
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => {
        throw new Error('storage disabled');
      },
      removeItem: () => {
        throw new Error('storage disabled');
      },
    };
    const storage = createOperatorTourStorage(throwingStore);

    expect(storage.hasCompleted()).toBe(false);
    expect(() => storage.markCompleted()).not.toThrow();
  });

  it('works without a store at all (SSR / unknown platform)', () => {
    const storage = createOperatorTourStorage(undefined);

    expect(storage.hasCompleted()).toBe(false);
    expect(() => storage.markCompleted()).not.toThrow();
  });

  it('can reset the flag so the tutorial can be replayed from scratch', () => {
    const store = createMemoryStore();
    const storage = createOperatorTourStorage(store);

    storage.markCompleted();
    storage.reset();

    expect(storage.hasCompleted()).toBe(false);
    expect(store.values[OPERATOR_TOUR_STORAGE_KEY]).toBeUndefined();
  });
});
