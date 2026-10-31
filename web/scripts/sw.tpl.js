// Offline service worker (template; seo.mjs writes dist/sw.js with the version and precache list). Same-origin GET only.
// Shell + index precached; chapter files (index/pass, index/faq), covers and pages are cached as visited.
// Cache poisoning: only 200 same-origin non-redirected responses without a query string are stored (a crafted ?x= link cannot fill or replace entries).
// Responses marked no-store or Vary: * are never stored; visited files are capped at MAX (oldest first, insertion order, not true LRU).
const V = "upou-offline-__VER__", PRE = [/*PRE*/];
self.addEventListener("install", (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(PRE))));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("upou-offline-") && k !== V).map((k) => caches.delete(k)))).then(() => self.registration.navigationPreload?.enable()).then(() => self.clients.claim())));
// R218: entries go only into an existing V, so after "prefs" is revoked (the page deletes the caches) a still-controlling worker stores nothing,
// even after a restart; "on" (sent on every register) re-creates V with the precache only when it is missing (re-consent).
self.addEventListener("message", (e) => { if (e.data === "skip") self.skipWaiting(); else if (e.data === "on") e.waitUntil(caches.has(V).then((h) => h || caches.open(V).then((c) => c.addAll(PRE))).catch(() => {})); });
const MAX = 200; // runtime entries kept besides the precache (R208)
const trim = (x) => x.keys().then((ks) => { const pre = PRE.map((p) => new URL(p, self.registration.scope).href), old = ks.filter((k) => !pre.includes(k.url)); return Promise.all(old.slice(0, Math.max(0, old.length - MAX)).map((k) => x.delete(k))); });
const put = (q, r) => { if (r.ok && r.type === "basic" && !r.redirected && !new URL(r.url).search && !/no-store/i.test(r.headers.get("cache-control") || "") && !/\*/.test(r.headers.get("vary") || "")) { const c = r.clone(); caches.has(V).then((h) => h && caches.open(V).then((x) => x.put(q, c).then(() => trim(x)))); } return r; };
self.addEventListener("fetch", (e) => {
  const q = e.request, u = new URL(q.url);
  if (q.method !== "GET" || u.origin !== location.origin || /\.(bin|wasm)$/.test(u.pathname) || u.pathname.endsWith("/sw.js")) return; // vectors/model stay under the model consent
  if (q.mode === "navigate") return e.respondWith(Promise.resolve(e.preloadResponse).then((r) => r || fetch(q)).then((r) => put(q, r)).catch(() => caches.match(q, { ignoreSearch: true }).then((r) => r || caches.match("./"))));
  if (u.pathname.includes("/assets/")) return e.respondWith(caches.match(q).then((r) => r || fetch(q).then((r) => put(q, r)))); // hashed names: immutable
  // round 46: index data is stale-while-revalidate (instant from the cache, refreshed for the next visit; the cache is per build)
  // R219: except k.json (login check data): network-first below, the cached copy only offline
  if (u.pathname.includes("/index/") && !u.pathname.endsWith("/index/k.json")) return e.respondWith(caches.match(q).then((c) => { const f = fetch(q).then((r) => put(q, r)); return c ? (f.catch(() => {}), c) : f.catch(() => Response.error()); }));
  e.respondWith(fetch(q).then((r) => put(q, r)).catch(() => caches.match(q).then((r) => r || Response.error())));
});
