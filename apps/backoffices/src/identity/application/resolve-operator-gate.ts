import { isPlatformOperator } from '../domain/is-platform-operator';
import type { PlatformOperator } from '../domain/platform-operator';

export type OperatorSession = {
  user: {
    id: string;
    app_metadata?: unknown;
    user_metadata?: unknown;
  };
} | null;

export type OperatorGate =
  | { kind: 'login' }
  | { kind: 'not-found' }
  | { kind: 'queue'; operator: PlatformOperator };

export function resolveOperatorGate(session: OperatorSession): OperatorGate {
  if (!session?.user?.id) {
    return { kind: 'login' };
  }

  if (!isPlatformOperator(session.user.app_metadata)) {
    return { kind: 'not-found' };
  }

  return {
    kind: 'queue',
    operator: {
      id: session.user.id,
      role: 'platform_operator',
    },
  };
}
