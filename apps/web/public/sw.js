// PWA service worker — §9. Network-first runtime cache: онлайн үед сүлжээнээс +
// кэшлэнэ, офлайн үед кэшээс үйлчилнэ (хуудас дахин ачаалагдана). POST (борлуулалт)
// нь зөвхөн сүлжээгээр — офлайн үед апп өөрөө IndexedDB дараалалд хадгална.
const CACHE = 'fuel-pos-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST/PUT → сүлжээ (offline дараалал апп-д)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // зөвхөн өөрийн origin

  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
        return res;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const root = await caches.match('/');
          if (root) return root;
        }
        return Response.error();
      }
    })(),
  );
});
