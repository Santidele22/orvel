import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { createSupabaseClient } from '../../core/runtime/supabase-client';
import { BusinessService } from '../settings/data-access/business.service';
import { readVapidPublicKey } from './operator-web-push-eligibility';

export type OperatorWebPushStatus = 'enabled' | 'unsupported' | 'denied' | 'off';

const PERSIST_ERROR = 'No se pudieron guardar los avisos push. Intentá de nuevo.';
const DISABLE_ERROR = 'No se pudieron desactivar los avisos push. Intentá de nuevo.';
const UNSUPPORTED_ERROR = 'Este dispositivo no admite avisos push.';
const DENIED_ERROR = 'Los avisos push están bloqueados en este dispositivo.';

function toUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

@Injectable({ providedIn: 'root' })
export class OperatorWebPushService {
  private readonly authService = inject(AuthService);
  private readonly businessService = inject(BusinessService);
  readonly status = signal<OperatorWebPushStatus>('off');

  async enableFromUserGesture(): Promise<void> {
    try {
      await this.enable();
    } catch {
      // Coach stays silent; Configuración surfaces persist errors.
    }
  }

  async enable(): Promise<void> {
    const vapidPublicKey = readVapidPublicKey();
    if (!vapidPublicKey || typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
      this.status.set('unsupported');
      throw new Error(UNSUPPORTED_ERROR);
    }

    let permission: NotificationPermission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission === 'denied') {
      this.status.set('denied');
      throw new Error(DENIED_ERROR);
    }
    if (permission !== 'granted') {
      this.status.set('off');
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toUint8Array(vapidPublicKey) as BufferSource,
      });
    }

    await this.persistSubscription(subscription);
    this.status.set('enabled');
  }

  async disable(): Promise<void> {
    const endpoint = await this.currentEndpoint();
    if (endpoint) {
      const { error } = await createSupabaseClient()
        .from('web_push_subscriptions')
        .delete()
        .eq('endpoint', endpoint);
      if (error) {
        throw new Error(DISABLE_ERROR);
      }
    }

    const subscription = await this.currentSubscription();
    if (subscription) {
      await subscription.unsubscribe();
    }

    this.status.set('off');
  }

  async refresh(): Promise<void> {
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !readVapidPublicKey()) {
      this.status.set('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      this.status.set('denied');
      return;
    }
    if (Notification.permission !== 'granted') {
      this.status.set('off');
      return;
    }

    const subscription = await this.currentSubscription();
    if (!subscription) {
      this.status.set('off');
      return;
    }

    const businessId = await this.businessService.getActiveBusinessId();
    const { data, error } = await createSupabaseClient()
      .from('web_push_subscriptions')
      .select('business_id')
      .eq('endpoint', subscription.endpoint)
      .maybeSingle();

    if (error || !data || data.business_id !== businessId) {
      this.status.set('off');
      return;
    }

    this.status.set('enabled');
  }

  private async persistSubscription(subscription: PushSubscription): Promise<void> {
    const userId = this.authService.user()?.id;
    if (!userId) {
      throw new Error(PERSIST_ERROR);
    }

    const businessId = await this.businessService.getActiveBusinessId();
    const payload = subscription.toJSON();
    const endpoint = payload.endpoint;
    const p256dh = payload.keys?.['p256dh'];
    const auth = payload.keys?.['auth'];
    if (!endpoint || !p256dh || !auth || !businessId) {
      throw new Error(PERSIST_ERROR);
    }

    const { error } = await createSupabaseClient().from('web_push_subscriptions').upsert(
      { endpoint, p256dh, auth, user_id: userId, business_id: businessId },
      { onConflict: 'endpoint' },
    );
    if (error) {
      throw new Error(PERSIST_ERROR);
    }
  }

  private async currentSubscription(): Promise<PushSubscription | null> {
    if (!('serviceWorker' in navigator)) {
      return null;
    }
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  }

  private async currentEndpoint(): Promise<string | null> {
    const subscription = await this.currentSubscription();
    return subscription?.endpoint ?? null;
  }
}
