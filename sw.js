/*
 * LocalForge 3D Offline Runtime
 */

const VERSION = "localforge-v1";

const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/app.css",
  "./assets/js/bootstrap.js",
  "./assets/js/runtime.js",
  "./assets/js/app.js",
  "./assets/js/storage/database.js",
  "./assets/js/storage/autosave.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then(cache =>
        cache.addAll(CORE)
      )
  );

  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(
              key => key !== VERSION
            )
            .map(
              key => caches.delete(key)
            )
        )
      )
  );

  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (
    event.request.method !== "GET"
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;

        return fetch(event.request)
          .then(response => {
            if (
              !response ||
              response.status !== 200
            ) {
              return response;
            }

            const copy =
              response.clone();

            caches
              .open(VERSION)
              .then(cache =>
                cache.put(
                  event.request,
                  copy
                )
              );

            return response;
          });
      })
  );
});
