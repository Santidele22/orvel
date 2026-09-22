import { inject } from 'vue';
import type { OpsFacade } from '../application/ops-facade';
import { OPS_KEY } from './ops-key';
import { TOAST_KEY, type ShowToast } from './toast-key';

export function useOps(): OpsFacade {
  const ops = inject(OPS_KEY);
  if (!ops) {
    throw new Error('OPS_CONTEXT_MISSING');
  }
  return ops;
}

export function useToast(): ShowToast {
  const showToast = inject(TOAST_KEY);
  if (!showToast) {
    throw new Error('TOAST_CONTEXT_MISSING');
  }
  return showToast;
}
