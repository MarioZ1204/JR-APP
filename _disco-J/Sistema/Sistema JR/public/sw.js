/* JR Burger — service worker (caché de la interfaz; la API siempre va a la red) */
const CACHE = 'jr-burger-v50';
const SHELL = [
  '/',
  '/index.html',
  '/css/fonts.css?v=50',
  '/css/app.css?v=50',
  '/js/api.js',
  '/js/app.js?v=50',
  '/js/burger-pick.js?v=50',
  '/favicon.svg',
  '/logo.png',
  '/manifest.webmanifest',
  '/fonts/outfit-400.ttf',
  '/fonts/outfit-500.ttf',
  '/fonts/outfit-600.ttf',
  '/fonts/outfit-700.ttf',
  '/fonts/alfa-slab-one.ttf'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API y sockets: solo red
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) {
    return;
  }

  // Navegación SPA: red primero, fallback a index en caché
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Estáticos: caché con actualización en segundo plano
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
