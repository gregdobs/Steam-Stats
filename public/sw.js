// ─────────────────────────────────────────────
// sw.js — installability only. This service worker deliberately caches
// NOTHING.
//
// A fetch handler is what makes the browser treat this as an installable app
// (rather than just a bookmarkable page), so one has to exist. But the usual
// reason to add caching on top — offline support and network latency — does
// not apply here:
//
//   - Every asset is served from 127.0.0.1 by the app's own Express server,
//     so there is no latency worth caching away.
//   - The app is useless without that server running (it proxies the Steam
//     Web API and reads local Steam data), so there is no meaningful offline
//     mode to build toward. A cached shell would just render an app that
//     immediately fails every request.
//   - Caching would actively hurt: after someone unzips a new release, a
//     stale precache would keep serving the previous build's JS until the
//     cache happened to be invalidated.
//
// So: pure network passthrough. If offline support is ever genuinely wanted,
// that's a deliberate redesign, not a tweak to this file.
// ─────────────────────────────────────────────

// Take over immediately rather than waiting for every tab to close, so a
// newly-unzipped release is never served by the previous version's worker.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Defensive: clear anything a previous (or future, reverted) version of
      // this file might have left behind, so no stale build can survive here.
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  // Straight to the network, always. Non-GET and range requests are passed
  // through untouched by the same path.
  event.respondWith(fetch(event.request));
});
