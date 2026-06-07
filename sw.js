// =============================================================
//  Service Worker – macht die App installierbar (Vollbild,
//  ohne Adressleiste) und offline-fähig.
//  Bei jeder Änderung an HTML/CSS/JS die CACHE-Version erhöhen,
//  damit die neue Fassung sicher ausgeliefert wird.
// =============================================================
const CACHE = "getraenke-v2";

// Relativ zum Scope (Ordner, in dem der SW liegt) – funktioniert
// auch in Unterverzeichnissen / auf GitHub Pages.
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./firebase-config.js",
  "./products.js",
  "./app.js",
  "./kasse.js",
  "./auth.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

// Installieren: App-Shell in den Cache legen.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Aktivieren: alte Cache-Versionen aufräumen.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Abrufen: für Navigationsanfragen "network-first" (damit Updates
// schnell ankommen, aber offline trotzdem die App startet),
// sonst "cache-first".
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Nur gleiche Herkunft cachen (keine Google-Fonts-Opaque-Responses sammeln).
        if (res.ok && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
