import type { InjectionKey } from 'vue';
import type { OpsFacade } from '../application/ops-facade';

export const OPS_KEY: InjectionKey<OpsFacade> = Symbol('ops');
