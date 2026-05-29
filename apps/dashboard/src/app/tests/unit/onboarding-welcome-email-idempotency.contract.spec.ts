import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_WELCOME_EMAIL_TRIGGERED_KEY,
  markWelcomeEmailTriggeredOnce
} from '../../features/onboarding/data-access/onboarding-flow-state';

function createMemoryStorage(seed?: Record<string, string>): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>(Object.entries(seed ?? {}));

  return {
    getItem(key: string): string | null {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    }
  };
}

describe('Onboarding welcome email trigger idempotency contract', () => {
  it('enqueues only once by storage gate semantics', () => {
    const storage = createMemoryStorage();

    expect(markWelcomeEmailTriggeredOnce(storage)).toBe(true);
    expect(storage.getItem(ONBOARDING_WELCOME_EMAIL_TRIGGERED_KEY)).toBe('1');
    expect(markWelcomeEmailTriggeredOnce(storage)).toBe(false);
  });

  it('rejects enqueue when already marked in storage', () => {
    const storage = createMemoryStorage({
      [ONBOARDING_WELCOME_EMAIL_TRIGGERED_KEY]: '1'
    });

    expect(markWelcomeEmailTriggeredOnce(storage)).toBe(false);
  });
});
