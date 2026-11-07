/// <reference lib="webworker" />
// Service worker: makes Silar work offline after the first visit. Copied
// from Skrubba's src/sw/sw.ts.
//
// Privacy: only files built into dist/ are ever cached. A path gets into the
// cache only if it is in MANIFEST, which the build writes from the files in
// dist/. Documents are read with File APIs and never fetched, results never
// leave the page, and POSTs (the page view) are not touched. So no user file
// or conversion result can end up here.
//
// Entries are keyed by content revision, so a deploy never mixes old and new
// files, and the previous build's files are kept one more cycle for tabs that
// still run it.
import { cacheKey, MANIFEST_KEY, networkPath, precacheList, SKIP_WAITING, type SwManifest, staleKeys, unredirected } from "./core.ts";

declare const self: ServiceWorkerGlobalScope;
declare const __SW_MANIFEST__: SwManifest;
declare const __SW_SHELL__: string[];

const MANIFEST: SwManifest = __SW_MANIFEST__;
const CACHE = "silar";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        precacheList(MANIFEST, __SW_SHELL__).map(async (path) => {
          const key = cacheKey(path, MANIFEST[path]);
          if (await cache.match(key)) return;
          const res = await unredirected(await fetch(networkPath(path), { cache: "no-cache" }));
          if (!res.ok) throw new Error(`precache ${path}: ${res.status}`);
          await cache.put(key, res);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

// The page asks again when the skipWaiting() above did not take (see
// retryWaitingActivation in src/ui/serviceWorker.ts).
self.addEventListener("message", (event) => {
  if (event.data === SKIP_WAITING) event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const stored = await cache.match(MANIFEST_KEY);
      const previous: SwManifest = stored ? await stored.json() : {};
      // Re-activating the same build must not forget the build before it.
      const before = JSON.stringify(previous) === JSON.stringify(MANIFEST) ? {} : previous;
      const keys = (await cache.keys()).map((r) => r.url);
      await Promise.all(staleKeys(keys, MANIFEST, before).map((url) => cache.delete(url)));
      await cache.put(MANIFEST_KEY, Response.json(MANIFEST));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // One screen: every navigation gets the app shell.
  const path = req.mode === "navigate" ? "/index.html" : url.pathname;
  const rev = MANIFEST[path];
  event.respondWith(rev ? cacheFirst(path, rev) : previousBuild(req, path));
});

async function cacheFirst(path: string, rev: string): Promise<Response> {
  const cache = await caches.open(CACHE);
  const key = cacheKey(path, rev);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await unredirected(await fetch(networkPath(path)));
  if (res.ok) await cache.put(key, res.clone());
  return res;
}

// Not in this build: a tab still running the previous build asking for one of
// its files. Every path except index.html is content-addressed, so whatever
// is cached under that path is the right file. Never stores anything.
// shortcut: a previous-build parser chunk that was never cached 404s after a
// deploy (the tab shows "Filen gick inte att läsa"); a reload fixes it.
async function previousBuild(req: Request, path: string): Promise<Response> {
  const cache = await caches.open(CACHE);
  return (await cache.match(path, { ignoreSearch: true })) ?? fetch(req);
}
