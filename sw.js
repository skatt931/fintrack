const CACHE = 'finance-v1';

// Pre-cache core shell on install
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([
      '/',
      '/index.html',
      '/css/app.css',
      '/js/app.js',
      '/js/auth.js',
      '/js/api.js',
      '/js/router.js',
      '/js/config.js',
      '/js/pages/dashboard.js',
      '/js/pages/add.js',
    ]))
  );
  self.skipWaiting();
});

// Remove old caches on activate
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: always try the network, update cache on success,
// fall back to cache only when offline
self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // Never intercept Google API / auth calls
  if (url.includes('googleapis.com') || url.includes('accounts.google.com')) return;

  e.respondWith(
    fetch(e.request)
      .then(resp => {
        // Cache a clone of every successful response
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
