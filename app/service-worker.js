const CACHE_NAME = 'life-tracker-v49';
const APP_SHELL = [
  './',
  'index.html',
  'confirmed.html',
  'reset-password.html',
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
  'js/theme.js',
  'js/changelog.js',
  'js/events.js',
  'js/money.js',
  'js/expenses.js',
  'js/balance.js',
  'js/rent.js',
  'js/statements.js',
  'js/grocery.js',
  'js/recipes.js',
  'js/goals.js',
  'js/documents.js',
  'js/home.js',
  'js/personal-todos.js',
  'js/comments.js',
  'js/ics.js',
  'js/backup.js',
  'js/installPrompt.js',
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

  // Only this app's own same-origin requests go through the cache-first
  // pipeline below -- everything else (Supabase, and the Google Identity
  // Services/API scripts loaded from accounts.google.com/apis.google.com
  // for Drive, see index.html) is left to the browser's own network
  // stack untouched. Routing a cross-origin request through this
  // service worker's own fetch()+cache.match() never bought anything
  // here (the cache.put() below is already origin-gated and would never
  // store it), and on some engines a service-worker-proxied cross-origin
  // script load is a real source of it silently failing or hanging --
  // exactly the "Google scripts isn't loading" failure mode this was
  // written to rule out. This used to only special-case *.supabase.co;
  // generalizing it to "any other origin" closes the same gap for Drive.
  if (url.origin !== self.location.origin) {
    return;
  }

  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
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
