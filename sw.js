/* ForgeVision service worker：外壳缓存，断网也能打开界面。
   策略：联网时优先取新文件（避免更新后看到旧界面），断网回落到缓存。 */
const CACHE = 'forgevision-v2';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './markdown.js',
  './storage.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  const cacheKey = request.mode === 'navigate' ? './index.html' : request;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(cacheKey, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(cacheKey).then((cached) => cached || caches.match('./index.html')),
      ),
  );
});
