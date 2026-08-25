/* global self, clients */
importScripts('./ngsw-worker.js');

const DEFAULT_CLICK_URL = '/dashboard/turnos';

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Orvel', {
      body: payload.body || 'Hay un cambio en tus turnos.',
      data: { url: payload.url || DEFAULT_CLICK_URL },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || DEFAULT_CLICK_URL;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const openClient = windows.find((client) => 'focus' in client);
      if (openClient) {
        openClient.navigate?.(targetUrl);
        return openClient.focus();
      }
      return clients.openWindow(targetUrl);
    }),
  );
});
