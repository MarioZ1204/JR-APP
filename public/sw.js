/* JR Burger — service worker (caché de la interfaz; la API siempre va a la red) */
const CACHE = 'jr-burger-v64';

/* Lo mínimo para que la app abra sin red. Los iconos de ingredientes no van aquí:
   son 58 archivos y el manejador de abajo los guarda solos la primera vez que se usan. */
const SHELL = [
  '/',
  '/index.html',
  '/css/fonts.css?v=64',
  '/css/app.css?v=64',
  '/js/api.js',
  '/js/app.js?v=64',
  '/js/burger-pick.js?v=64',
  '/favicon.svg',
  '/logo.webp?v=64',
  '/patron.webp',
  '/manifest.webmanifest',
  '/fonts/outfit-400.woff2',
  '/fonts/outfit-500.woff2',
  '/fonts/outfit-600.woff2',
  '/fonts/outfit-700.woff2',
  '/fonts/alfa-slab-one.woff2',
  /* Categorías: se ven en la pantalla principal de venta, conviene tenerlas listas. */
  '/icons/cats/adicional.webp?v=64',
  '/icons/cats/arepa.webp?v=64',
  '/icons/cats/bebida.webp?v=64',
  '/icons/cats/carne.webp?v=64',
  '/icons/cats/especial.webp?v=64',
  '/icons/cats/hamburguesa.webp?v=64',
  '/icons/cats/mazorca.webp?v=64',
  '/icons/cats/menu.webp?v=64',
  '/icons/cats/perro.webp?v=64',
  '/icons/cats/salchipapa.webp?v=64'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Cada archivo por separado: si uno falla, el resto sí queda en caché.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined))))
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
