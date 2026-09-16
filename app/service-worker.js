const CACHE_NAME = 'life-tracker-v3';
const APP_SHELL = [
  './',
  'index.html',
  'confirmed.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/config.js',
  'js/supabaseClient.js',
  'js/vendor/supabase.js',
  'js/dom.js',
  'js/format.js',
  'js/crud.js',
  'js/auth.js',
  'js/household.js',
  'js/notifications.js',
  'js/events.js',
  'js/expenses.js',
  'js/replacements.js',
  'js/repayments.js',
  'js/documents.js',
  'js/home.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache calls to Supabase (auth/data/storage) — always go to network.
  if (url.hostname.endsWith('.supabase.co')) {
    return;
  }

  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Life Tracker', body: 'You have an update.' };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    // Non-JSON payload — fall back to the default above.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
