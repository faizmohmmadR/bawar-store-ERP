const CACHE_NAME = 'mbz-erp-v2';
const STATIC_ASSETS = ['/logo.jpeg', '/manifest.webmanifest'];

function shouldBypass(url) {
  if (url.pathname.startsWith('/api')) return true;
  if (url.pathname.startsWith('/@')) return true;
  if (url.pathname.startsWith('/src/')) return true;
  if (url.pathname.includes('node_modules')) return true;
  if (url.pathname.startsWith('/__vite')) return true;
  return false;
}

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith('/assets/') &&
    /\.[a-zA-Z0-9_-]{8,}\.(js|css|woff2?|png|jpe?g|svg|webp|gif)$/i.test(url.pathname)
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, copy);
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match('/index.html');
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (shouldBypass(url)) return;

  if (
    event.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html')
  ) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (isImmutableAsset(url) || STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Let the browser handle everything else (no stale caching).
});
