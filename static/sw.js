const CACHE_NAME = "d3golf-v2";
const PRECACHE_URLS = [
  "/static/style.css",
  "/static/logo.png",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Live data must always be fresh - never intercept API calls.
  if (url.pathname.startsWith("/api/")) return;

  // Icons/logo change rarely: serve from cache first, refresh quietly in the background.
  if (url.pathname.startsWith("/static/icons/") || url.pathname === "/static/logo.png") {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            return res;
          })
      )
    );
    return;
  }

  // Everything else (pages, JS, CSS): network-first, so a new deploy shows up
  // on the very next load instead of getting stuck on a cached version. Cache
  // is only a fallback for when the phone is offline. "no-store" forces an
  // actual network round-trip - without it, fetch() can still be silently
  // satisfied by the browser's own HTTP cache underneath this handler.
  event.respondWith(
    fetch(new Request(req, { cache: "no-store" }))
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
