// WinRate service worker — cache-first con versionado.
// Al publicar cambios, sube CACHE_VERSION para que los usuarios reciban el aviso de actualización.
const CACHE_VERSION = "winrate-v1.2.1";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./js/logic.js",
  "./js/storage.js",
  "./js/audio.js",
  "./js/icons.js",
  "./js/fx.js",
  "./js/charts.js",
  "./vendor/chart.umd.4.4.1.min.js",
  "./vendor/fonts/press-start-2p-latin.woff2",
  "./vendor/fonts/press-start-2p-latin-ext.woff2",
  "./vendor/fonts/vt323-latin.woff2",
  "./vendor/fonts/vt323-latin-ext.woff2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-64.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("winrate-") && k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => (req.mode === "navigate" ? caches.match("./index.html") : Response.error()));
    })
  );
});
