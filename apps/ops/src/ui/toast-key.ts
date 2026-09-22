import type { InjectionKey } from 'vue';

export type ShowToast = (message: string, error?: boolean) => void;

export const TOAST_KEY: InjectionKey<ShowToast> = Symbol('toast');
