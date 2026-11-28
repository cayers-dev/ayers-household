// Ayers Household service worker: caches the app shell so it opens fast.
// Data always comes live from the server and is never cached here.
const CACHE = "hh-shell-v39";
const SHELL = ["./", "index.html", "styles.css", "app.js", "modules.js", "hockey.js", "shopping.js", "vehicles.js", "tasks.js", "financial.js", "pets.js", "work.js", "config.js", "manifest.webmanifest",
               "icons/icon.svg", "icons/icon-192.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  // Only same-origin GETs (the app shell). API calls and Google sign-in pass straight through.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("version.json")) return;
  e.respondWith(
    fetch(req, { cache: "no-cache" }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});
