// CDP Fixture — sw.js — 2026-05-11 13:00 ARG
// Estrategia:
//   · HTML (index.html, navegaciones): Network First → siempre busca lo último.
//     Si falla la red, sirve de cache (modo offline).
//   · Recursos estáticos (escudos, imágenes, fuentes): Cache First → rápido.
//   · Cuando se sube una versión nueva, los usuarios ven los cambios al recargar.

const VERSION    = 'v4-2026-05-11';
const CACHE_HTML = 'cdp-html-' + VERSION;
const CACHE_ASSETS = 'cdp-assets-' + VERSION;

self.addEventListener('install', (event) => {
  // Activar el SW nuevo inmediatamente sin esperar a que cierren todas las pestañas
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Limpiar caches de versiones viejas
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== CACHE_HTML && k !== CACHE_ASSETS)
          .map(k => caches.delete(k))
    );
    // Tomar control de las pestañas abiertas inmediatamente
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo GET y solo mismo origen
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Estrategia distinta para HTML vs estáticos
  const isHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html') ||
                 url.pathname.endsWith('.html') ||
                 url.pathname === '/' ||
                 url.pathname.endsWith('/');

  if (isHTML) {
    // NETWORK FIRST: siempre intenta lo último, cae a cache si no hay red
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        // Guardar copia en cache para modo offline
        const cache = await caches.open(CACHE_HTML);
        cache.put(req, fresh.clone()).catch(()=>{});
        return fresh;
      } catch (err) {
        // Sin red: servir lo que haya en cache
        const cache = await caches.open(CACHE_HTML);
        const cached = await cache.match(req);
        if (cached) return cached;
        // Último recurso: buscar index.html cacheado
        const indexFallback = await cache.match('/') || await cache.match('index.html');
        if (indexFallback) return indexFallback;
        throw err;
      }
    })());
  } else {
    // CACHE FIRST para estáticos (escudos, imágenes, fonts, etc.)
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_ASSETS);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.status === 200) {
          cache.put(req, fresh.clone()).catch(()=>{});
        }
        return fresh;
      } catch (err) {
        throw err;
      }
    })());
  }
});

// Mensaje para forzar actualización desde la app
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
