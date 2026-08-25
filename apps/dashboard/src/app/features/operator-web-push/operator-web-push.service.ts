import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { createSupabaseClient } from '../../core/runtime/supabase-client';
import { BusinessService } from '../settings/data-access/business.service';
import { readVapidPublicKey } from './operator-web-push-eligibility';

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

  async enableFromUserGesture(): Promise<void> {
    try {
      const vapidPublicKey = readVapidPublicKey();
      if (!vapidPublicKey || typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toUint8Array(vapidPublicKey) as BufferSource,
      });
      await this.persistSubscription(subscription);
    } catch {
      // Denied, missing VAPID, or persist failure must stay silent.
    }
  }

  private async persistSubscription(subscription: PushSubscription): Promise<void> {
    const userId = this.authService.user()?.id;
    if (!userId) {
      return;
    }

    const businessId = await this.businessService.getActiveBusinessId();
    const payload = subscription.toJSON();
    const endpoint = payload.endpoint;
    const p256dh = payload.keys?.p256dh;
    const auth = payload.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return;
    }

    await createSupabaseClient().from('web_push_subscriptions').upsert(
      { endpoint, p256dh, auth, user_id: userId, business_id: businessId },
      { onConflict: 'endpoint' },
    );
  }
}
