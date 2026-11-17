// Hess Finance service worker. Handles notifications, and lets the app open with no signal.
// It always asks the internet first, so with signal the app loads fresh code exactly as before.
// A copy of the app's own files (never any data) is kept only as a fallback for when the phone is offline.
const CACHE = "hess-app-v1";
const APP_FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "apple-touch-icon.png", "favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try { const c = await caches.open(CACHE); await c.addAll(APP_FILES); } catch (e) {}
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith("hess-") && k !== CACHE).map((k) => caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // only the app's own files; GitHub data and fonts are never touched or stored
  if (req.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    } catch (e) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") { const page = await caches.match("index.html"); if (page) return page; }
      throw e;
    }
  })());
});

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : "" }; }
  const title = d.title || "Hess Finance";
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: d.tag || "hess",
    data: { url: d.url || "./" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // only ever open pages inside Hess Finance, never another website
  let url = self.registration.scope;
  try {
    const u = new URL((event.notification.data && event.notification.data.url) || "./", self.registration.scope).href;
    if (u.startsWith(self.registration.scope)) url = u;
  } catch (e) {}
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) {
        await w.focus();
        try { await w.navigate(url); } catch (e) { w.postMessage({ open: url }); }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
