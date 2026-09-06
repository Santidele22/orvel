/* global self, clients */
importScripts('./ngsw-worker.js');

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: false }).then((controlled) => {
      const controlledIds = new Set(controlled.map((client) => client.id));
      return self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((windows) =>
          self.clients.claim().then(() =>
            Promise.all(
              windows.map((client) => {
                if (controlledIds.has(client.id)) {
                  return undefined;
                }
                if (typeof client.navigate !== 'function') {
                  return undefined;
                }
                return client.navigate(client.url);
              }),
            ),
          ),
        );
    }),
  );
});

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
