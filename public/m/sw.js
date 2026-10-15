// Service worker for the iPhone app: everything the app needs is cached so it opens offline.
// The shell is served from cache and refreshed in the background when the PC is reachable,
// animations live in their own cache (filled by app.js after a sync), the API is never cached.
const SHELL = 'gymlog-shell-v1';
const MEDIA = 'gymlog-media';
const FILES = [
  '/m/', '/m/index.html', '/m/m.css', '/m/app.js', '/m/store.js', '/m/require.js', '/m/manifest.webmanifest',
  '/m/icon-180.png', '/m/icon-192.png', '/m/icon-512.png', '/css/app.css', '/js/confirm.js',
  '/m/lib/units.js', '/m/lib/format.js', '/m/lib/muscles.js', '/m/lib/heads.js', '/m/lib/sports.js',
  '/m/lib/icons.js', '/m/lib/bodymap.js', '/m/lib/stats.js',
  '/fonts/saira-semi-condensed-latin-500-normal.woff2', '/fonts/saira-semi-condensed-latin-600-normal.woff2',
  '/fonts/saira-semi-condensed-latin-700-normal.woff2', '/fonts/saira-semi-condensed-latin-800-normal.woff2',
  '/fonts/atkinson-hyperlegible-latin-400-normal.woff2', '/fonts/atkinson-hyperlegible-latin-700-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== MEDIA).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/m/media/')) {
    // Animations: from the phone's cache; fetched (and kept) only if missing.
    e.respondWith(caches.open(MEDIA).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }))));
    return;
  }
  // Shell: cached copy right away; update it in the background when the PC answers.
  e.respondWith(caches.open(SHELL).then((c) => c.match(e.request, { ignoreSearch: true }).then((hit) => {
    const fresh = fetch(e.request).then((res) => {
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }).catch(() => hit);
    return hit || fresh;
  })));
});
