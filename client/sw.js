/**
 * Service Worker
 *
 * This service worker provides a simple handler for push events so that
 * notifications can be displayed when the application is not in the
 * foreground. In a real deployment you would set up a push
 * subscription and send push messages from the server. For this
 * example, the worker simply listens for push events and shows the
 * payload as a notification. If the push message does not include
 * structured data, it falls back to a generic title.
 */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'New notification', body: event.data && event.data.text() };
  }
  const title = data.title || 'New message';
  const options = {
    body: data.body || '',
    icon: '/assets/background.png',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Optionally handle notification clicks by focusing the client
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});