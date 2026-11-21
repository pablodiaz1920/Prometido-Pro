// Service worker: guarda la app en el celular para que abra SIN internet.
// IMPORTANTE: cada vez que cambies cualquier archivo, sube el número de VERSION
// para que los celulares descarguen la versión nueva.
const VERSION = 'v5.0.2';
const CACHE = `prometido-pro-${VERSION}`;

// Lógica del ciclo compartida con la app (para armar el aviso diario)
importScripts('./js/data.js', './js/cycle.js');

const DATA_CACHE = 'pp-data'; // datos mínimos que deja la app (no se borra al actualizar)

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/data.js',
  './js/cycle.js',
  './js/sync.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './fonts/plus-jakarta-sans-latin-400-normal.woff2',
  './fonts/plus-jakarta-sans-latin-500-normal.woff2',
  './fonts/plus-jakarta-sans-latin-600-normal.woff2',
  './fonts/plus-jakarta-sans-latin-700-normal.woff2',
  './fonts/plus-jakarta-sans-latin-800-normal.woff2',
  './fonts/jetbrains-mono-latin-400-normal.woff2',
  './fonts/jetbrains-mono-latin-600-normal.woff2'
];

self.addEventListener('install', (event) => {
  // cache: 'reload' evita tomar archivos viejos de la caché HTTP del navegador.
  // skipWaiting: la versión nueva se activa sola, sin esperar a que toques nada.
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('prometido-pro-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// La app pide activar la nueva versión cuando tocas "Actualizar"
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'GET_VERSION' && event.ports[0]) event.ports[0].postMessage(VERSION);
});

// Estrategia "primero la caché": abre al instante y sin conexión.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Navegación (abrir la app): siempre devuelve index.html desde la caché
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => cached || fetch(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});

/* ---------- Aviso diario en segundo plano (Android/Chrome con la app instalada) ---------- */
async function readJSON(key) {
  const cache = await caches.open(DATA_CACHE);
  const res = await cache.match(key);
  return res ? res.json() : null;
}

async function maybeNotify() {
  const data = await readJSON('./__state.json');
  if (!data || !data.config || !data.config.notifyEnabled) return;
  const today = toISODate(new Date());
  const last = await readJSON('./__notified.json');
  if (last && last.date === today) return;
  const [h, m] = (data.config.notifyTime || '08:30').split(':').map(Number);
  const now = new Date();
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;

  const b = dailyBriefing(data.config, now);
  await self.registration.showNotification(b.title, {
    body: b.body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'daily-briefing',
    data: { url: './' }
  });
  const cache = await caches.open(DATA_CACHE);
  await cache.put('./__notified.json', new Response(JSON.stringify({ date: today })));
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'daily-briefing') event.waitUntil(maybeNotify());
});

// Tocar la notificación abre (o enfoca) la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./');
    })
  );
});
