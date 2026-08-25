export type OperatorWebPushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export type OperatorWebPushInput = {
  isIos: boolean;
  isStandalone: boolean;
  notificationSupported: boolean;
  permission: OperatorWebPushPermission;
  vapidPublicKey?: string | null;
};

export function readVapidPublicKey(): string | null {
  const fromWindow = (globalThis as { window?: { __ORVEL_DASHBOARD_ENV__?: { VAPID_PUBLIC_KEY?: string } } })
    .window?.__ORVEL_DASHBOARD_ENV__?.VAPID_PUBLIC_KEY;
  const fromProcess = (globalThis as { process?: { env?: { VAPID_PUBLIC_KEY?: string } } }).process?.env
    ?.VAPID_PUBLIC_KEY;
  const key = String(fromWindow || fromProcess || '').trim();
  return key || null;
}

export function evaluateOperatorWebPush(input: OperatorWebPushInput): {
  canRequest: boolean;
  isPageError: boolean;
} {
  const hasVapid = Boolean(input.vapidPublicKey?.trim());
  const unsupported = !input.notificationSupported || input.permission === 'unsupported' || !hasVapid;
  if (unsupported || input.permission !== 'default' || !input.isStandalone || (input.isIos && !input.isStandalone)) {
    return { canRequest: false, isPageError: false };
  }
  return { canRequest: true, isPageError: false };
}
