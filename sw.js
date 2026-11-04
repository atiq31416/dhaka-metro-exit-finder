// Offline support: app shell is cached on install; map tiles are cached as you browse.
const VERSION = "dm-v27";
const SHELL = ["./", "index.html", "styles.css", "app.js", "data.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "img/atiqur.jpg",
  "vendor/leaflet/leaflet.css",
  "vendor/leaflet/leaflet.js", "analytics.js", "live.js", "firebase-config.js",
  "fonts/dm-sans.woff2", "fonts/funnel-display.woff2", "fonts/li-ador-noirrit-regular.ttf", "fonts/li-ador-noirrit-semibold.ttf", "fonts/li-ador-noirrit-bold.ttf", "fonts/li-ador-noirrit-light.ttf"];
const TILES = "dm-tiles";
const MAX_TILES = 600;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== TILES).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trimTiles() {
  const c = await caches.open(TILES); const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.hostname.endsWith("nominatim.openstreetmap.org")) return; // live search only
  if (/firebaseio\.com|firebasedatabase\.app|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/.test(url.hostname)) return; // live trains: never cache
  if (/google-analytics\.com|googletagmanager\.com|firebase(installations|logging)?\.googleapis\.com|analytics\.google\.com/.test(url.hostname)) return; // analytics: never cache
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(e.request); if (hit) return hit;
      try { const r = await fetch(e.request); if (r.ok || r.type === "opaque") { c.put(e.request, r.clone()); trimTiles(); } return r; }
      catch { return new Response("", { status: 504 }); }
    }));
    return;
  }
  // App files: network first (so data fixes show up), fall back to cache offline.
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
});
