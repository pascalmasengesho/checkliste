"use strict";

const CACHE_NAME = "kigali-checklist-__BUILD_ID__";
const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles.css?v=__STYLES_VERSION__",
  "./app.js?v=__APP_VERSION__",
  "./vendor/checklist-pdf.js?v=__PDF_VERSION__",
  "./template.pdf",
  "./assets/masengesho-pascal-signature.png",
  "./assets/mwumvaneza-fabrice-signature.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-180.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith("kigali-checklist-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return await cache.match(request) || cache.match(new URL("./index.html", self.registration.scope));
        }),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME)
      .then((cache) => cache.match(request, { ignoreSearch: true }))
      .then((cached) => cached || fetch(request)),
  );
});
