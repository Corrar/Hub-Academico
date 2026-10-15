"use strict";
// Service worker: installable shell, push display and notification clicks.
// API responses are never cached: they carry personal data and are no-store.
const CACHE = "fatec-hub-shell-v1";
const SHELL = [
  "./",
  "assets/panel.css",
  "assets/panel.js",
  "assets/admin.js",
  "assets/academic.js",
  "assets/attendance.js",
  "assets/device.js",
  "assets/experience.js",
  "assets/plus-jakarta-sans-latin-wght-normal.woff2",
  "assets/logo-fatec.png",
  "assets/logo-cps-t.png",
  "assets/logo-sp-t.png",
  "assets/icon-192.png",
  "assets/badge-96.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.includes("/api/")
  )
    return;
  // Network first keeps deployments current; the cache only covers offline use.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response.ok &&
          (request.mode === "navigate" ||
            SHELL.some((item) =>
              url.pathname.endsWith(item.replace("./", "/")),
            ))
        ) {
          // Clone before returning: the page consumes the original body.
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(request, { ignoreSearch: true })
          .then(
            (cached) =>
              cached ||
              (request.mode === "navigate" ? caches.match("./") : undefined) ||
              Response.error(),
          ),
      ),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "Fatec Adamantina";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Há novidades no Hub Acadêmico.",
      icon: "assets/icon-192.png",
      badge: "assets/badge-96.png",
      tag: data.tag,
      lang: "pt-BR",
      data: {
        page: /^[a-zA-Z]+$/.test(data.page || "") ? data.page : "reminders",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    "./#" + event.notification.data.page,
    self.registration.scope,
  );
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        const open = windows.find((client) =>
          client.url.startsWith(self.registration.scope),
        );
        if (open)
          return open.navigate(target.href).then((client) => client?.focus());
        return self.clients.openWindow(target.href);
      }),
  );
});
