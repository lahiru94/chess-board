// Service worker (PLAN.md 6.1): offline use and instant repeat visits.
// - Pages: network first, so a new deploy shows at once; the cached copy is the offline fallback.
// - /assets/*: hashed, never change, so cache first.
const CACHE = 'chess-board-v1';
const MAX_ASSETS = 40;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const res = await fetch('/', { cache: 'no-cache' });
      if (!res.ok) return;
      const html = await res.clone().text();
      await cache.put('/', res);
      // The page's own assets were fetched before this worker existed; cache them now.
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      await cache.addAll(assets);
    })(),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') event.respondWith(networkFirst(req));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put('/', res.clone());
    return res;
  } catch {
    return (await cache.match('/')) ?? Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  // Hashed files never change, so Vary (e.g. Origin on module scripts) can be ignored.
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    await trim(cache);
  }
  return res;
}

/** Old hashed assets pile up across deploys; keep the newest MAX_ASSETS. */
async function trim(cache) {
  const assets = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith('/assets/'));
  for (const r of assets.slice(0, Math.max(0, assets.length - MAX_ASSETS))) await cache.delete(r);
}
