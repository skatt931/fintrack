const CACHE = 'finance-v3';

// Minimal install — just activate immediately, no precaching
// (precaching with absolute paths breaks on GitHub Pages subdirectory deployments)
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: always fetch fresh, cache the response, fall back when offline
self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  if (url.includes('googleapis.com') || url.includes('accounts.google.com')) return;

  e.respondWith(
    fetch(e.request)
      .then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
