import { describe, expect, it } from 'vitest';
import { resolveOperatorGate } from './resolve-operator-gate';

describe('resolveOperatorGate', () => {
  it('sends a missing session to login', () => {
    expect(resolveOperatorGate(null)).toEqual({ kind: 'login' });
  });

  it('sends a salon JWT without platform_operator to generic not-found', () => {
    const gate = resolveOperatorGate({
      user: {
        id: 'salon-user',
        app_metadata: { role: 'authenticated' },
        user_metadata: { role: 'platform_operator' },
      },
    });

    expect(gate).toEqual({ kind: 'not-found' });
    expect(JSON.stringify(gate).toLowerCase()).not.toContain('unauthorized');
    expect(JSON.stringify(gate).toLowerCase()).not.toContain('admin');
  });

  it('opens the billing queue for a platform operator', () => {
    expect(
      resolveOperatorGate({
        user: {
          id: 'ops-1',
          app_metadata: { role: 'platform_operator' },
        },
      }),
    ).toEqual({
      kind: 'queue',
      operator: { id: 'ops-1', role: 'platform_operator' },
    });
  });
});
