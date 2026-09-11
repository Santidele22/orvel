import { describe, expect, it } from 'vitest';
import { isPlatformOperator } from './is-platform-operator';

describe('isPlatformOperator', () => {
  it('is true only when app_metadata.role is platform_operator', () => {
    expect(isPlatformOperator({ role: 'platform_operator' })).toBe(true);
  });

  it('is false for other app_metadata roles', () => {
    expect(isPlatformOperator({ role: 'authenticated' })).toBe(false);
    expect(isPlatformOperator({ role: 'admin' })).toBe(false);
    expect(isPlatformOperator({})).toBe(false);
    expect(isPlatformOperator(null)).toBe(false);
    expect(isPlatformOperator(undefined)).toBe(false);
  });

  it('never reads user_metadata even if it claims the operator role', () => {
    expect(
      isPlatformOperator({
        role: 'salon_owner',
        user_metadata: { role: 'platform_operator' },
      }),
    ).toBe(false);
  });
});
