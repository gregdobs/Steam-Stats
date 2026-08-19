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
  // CRITICAL: cross-origin requests must fall through untouched.
  //
  // Calling event.respondWith(fetch(request)) unconditionally — which this
  // file used to do — re-issues *every* request as a fetch() from the worker.
  // A fetch() is governed by connect-src, not by the directive that matches
  // the original request type. connect-src here is 'self', so every
  // cross-origin <img> load (which img-src explicitly permits) was rewritten
  // into a connection the CSP forbids:
  //
  //   Fetch API cannot load https://cdn.../header.jpg.
  //   Refused to connect because it violates the document's CSP.  at sw.js
  //
  // That silently blocked all Steam game artwork and the profile avatar. The
  // worker exists only to make the page installable; it has no business
  // touching requests it isn't going to do anything with.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Same-origin only, still a plain network passthrough with no caching.
  event.respondWith(fetch(event.request));
});
