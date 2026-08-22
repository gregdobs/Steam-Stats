# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versioning follows [SemVer](https://semver.org/).

## [Unreleased]

## [1.3.0] - 2026-08-21

Adds a Calendar page, and makes playtime history durable and unbounded.

### Added
- **A Calendar page** — a month grid of day-by-day playtime, with a click on any day breaking that day down across games and listing the achievements unlocked on it. It sits next to Dashboard in the navbar rather than next to History, because its primary layer is recent activity and two adjacent items both meaning "the past" would be hard to tell apart.

  The page's main design constraint is honesty about its own data. Steam's API reports lifetime totals rather than sessions, so a day's playtime has to be inferred by diffing two daily snapshots — which means the app only knows about days it was actually open. Every other snapshot-derived chart quietly treats a missing day as zero; harmless on a sparkline, misleading on a calendar, where a blank week reads as "I didn't play anything". So days are tri-stated: played, tracked-but-idle, and *no coverage*, each drawn differently and explained in a legend that lists only the states actually on screen.

  For the same reason a multi-day gap never gets its total dumped onto one date. A delta is only attributed to a single day when snapshots exist a day either side of it; wider gaps show the span total as context instead ("3.4h across the 3 days from Aug 19 to Aug 21"), which also stops the days you happened to reopen the app from looking like your heaviest gaming days.

  Because snapshot history only starts when you install the app, the calendar also layers in achievement unlocks, which Steam timestamps itself and which reach back to your first one. That's what gives the page something real to show on day one and in every month that predates tracking — including a "Months on record" strip for jumping back through years of unlocks. Alongside: a month rail (hours, days played, longest run, coverage, most-played games, and what you *started* that month) that switches to day detail on selection, a per-game filter for seeing exactly when you binged something, and a daily percentile once there are 7+ tracked days to compare against.
- **Snapshot history can now actually be recovered, and is backed up.** The data folder always contained a `snapshots.json`, and the README always said it was the durable copy that survived a cleared browser profile — but nothing ever read it back. The app wrote to it and only ever loaded history from `localStorage`. A `GET` endpoint existed and had no callers. So a cleared Chromium profile, a new machine, or a changed port (which is a different *origin*, and therefore different `localStorage`) lost the entire history while a perfectly good copy sat unread on disk. Playtime history is the one thing here that can't be re-fetched — Steam reports lifetime totals, not sessions, so a day nobody recorded is gone permanently.

  The app now pulls anything the archive has that the browser profile doesn't, on startup, before writing the day's snapshot. **Settings → Data & Cache → Backup Snapshots** exports the full archive to a file and imports one back; import merges, so it can only add days you're missing and never removes days you already have.
- **The Calendar shows your whole history, not the last 90 days.** `localStorage` holds a 90-day working set — it's quota-bound, and full snapshots are ~18KB each — so the page used to be limited to that even though the archive kept everything. It now reads per-day playtime straight from the archive via a new endpoint that ships only what changed each day: two years of history is a 115KB download, where sending reconstituted snapshots would have been 12.4MB.

  This also fixes a guarantee that would have quietly broken on its own. The Calendar draws every day as played, idle, or *no coverage*, and works out where tracking begins from the oldest snapshot it can see. Reading that from `localStorage` meant that on day 91, every month behind the window would have started rendering as "before tracking started" — real, archived history labelled as though it never existed. That boundary now comes from the archive.
- **Hovering an achievement icon in the Calendar's day rail shows what it was for.** A slimmed-down version of the card the Achievements page uses — name, game, the description, and how many owners have it — with no hero image or completion breakdown, because it appears on hover rather than on click. Rarity is fetched only for the games on the day you actually opened, so a tooltip most days never show doesn't cost a library-wide request.
- **The notice above the Calendar grid is contextual, and its normal state is hidden.** It used to be a fixed explainer about playtime tracking warming up. It now resolves to nothing at all once tracking is healthy, and the slot is free to carry whatever is actually worth saying — currently the warm-up explanation, or a heads-up when a run of recent days has no coverage (which is worth knowing, because those days are marked rather than counted as zero and can't be filled in later). Only ever one notice at a time, never stacked.
- **The Calendar page is reordered around the grid.** The calendar and its rail now sit directly under the page description instead of below a row of statistics, so the thing the page is named after is the first thing on it. Lifetime totals moved beneath the grid they summarise, and the snapshot-recency line moved to the very bottom, where it reads as a footnote rather than a headline. The "playtime tracking hasn't got a full day yet" notice is a single compact row instead of a heading over a paragraph — it's a temporary state and shouldn't cost more vertical space than the grid it's explaining.
- **Jumping to another month moved into a dropdown on the month name**, replacing the "Months on record" strip that used to sit at the bottom of the page. Navigation now lives on the control you'd already reach for to change months, and the panel lays years out as rows of twelve so the shape of a year is readable at a glance — which the horizontal scroller never managed. Each month is shaded by how many achievements you unlocked in it, with a dot for months that also have day-level playtime coverage.
- **Same-month-last-year comparison** in the Calendar's month rail — hours and days played against the same month a year earlier, with the change as a percentage. It's the question a 90-day window structurally couldn't answer, and it stays hidden until there's actually a year of history to compare against.
- **The Calendar shows when the last reading was taken**, and when the next one lands. Previously that was only visible in a log behind a toggle in Settings, and the Dashboard's "Synced" line is a different fact (the last API fetch, not the last snapshot).

### Fixed
- **No achievement icon has ever loaded in a packaged build.** Steam serves achievement art from `steamcdn-a.akamaihd.net`, a host unrelated to the `cdn.*.steamstatic.com` edges that game artwork uses, and it was missing from the server's `img-src` policy — so the browser silently dropped every one of them, in the Calendar's day detail, the rarity list and the achievement detail panel alike. It looked fine the whole time in development, because `npm run dev` serves the frontend through Vite, which applies no CSP; only the Express server that the desktop app runs on does. Same shape of trap as the Google-Fonts bug fixed in 1.2.1.
- **The desktop app had a white title bar sitting on top of a near-black window.** Windows draws the caption from Chromium's dark-mode state, which the app never set, so on a light Windows the frame came out white regardless of the theme. It now matches: dark by default (set before any window is created, so there's no light-to-dark flip during launch), and it follows the app if you switch to the Light glass theme.
- **The snapshot mirror had been silently rejecting almost every write.** The server parses request bodies with `express.json()`, whose default limit is 100kb — but a snapshot post carries the client's entire 90-day window, which is ~1.5MB for a 311-game library and ~10MB for a 2,000-game one. Anything past roughly five snapshots came back `413 Payload Too Large`, and because the mirror write was fire-and-forget with an empty `.catch()`, nothing was logged and nothing surfaced. In practice the durable copy stopped updating a few days into use and stayed frozen. `/api/snapshots` now gets its own parser with a limit sized for real payloads, and a failed mirror write logs a warning instead of vanishing.

### Changed
- **The snapshot archive no longer truncates itself to 90 days.** `POST /api/snapshots/:steamId` replaced the stored history with whatever the client sent, and the client only ever sends its 90-day working set — so the durable copy was silently capped at the same 90 days it was supposed to outlive. It now merges, and keeps everything. `localStorage` still holds 90 days, because it's quota-bound and shares ~5MB with the other caches.
- **The archive is delta-encoded and no longer pretty-printed**, which it needed to be before uncapping it. Measured against a real 311-game library, 99.7% of the rows in a daily snapshot repeat the previous day byte for byte, and the file was written with 2-space indentation on top of that — 92% overhead. Storing one base snapshot plus only the games whose playtime moved took a snapshot from 18,614 bytes to 338 (98.2% smaller). In practice that turns five years of history from ~62MB into well under a megabyte for this library, and from an estimated ~400MB into a few megabytes for a 2,000-game one. Existing files migrate automatically on first read, and `GET` reconstitutes full snapshots so nothing downstream in the app sees the change. Repeated launches on the same day now skip the write entirely instead of rewriting the whole file.

## [1.2.1] - 2026-08-18

Fixes for artwork, typography and startup feedback found after the 1.2.0 release.

### Added
- **A loading screen while the app starts.** Startup previously showed nothing at all until the window was ready — the window is deliberately held back until it can paint, so there was a silent gap. That gap is most noticeable in the portable build, which self-extracts ~88MB before any of the app's own code runs, and then still has to start the local server. A small window now appears immediately with the app mark and a live status line ("Starting local server…" → "Waiting for server…" → "Loading your library…"), and is swapped for the real window in a single step so there's never a moment with neither on screen.

### Fixed
- **The app was rendering in the wrong font.** `index.html` pulled DM Sans and DM Mono from Google Fonts, but the server's CSP is `style-src 'self' 'unsafe-inline'` — which refuses an external stylesheet outright. Every packaged build had therefore been falling back to the system sans, silently, since before the desktop app existed. Both families are now bundled with the app (`public/fonts/`, 140KB) and declared with local `@font-face` rules, so the typography is the intended one. Self-hosting rather than relaxing the CSP was the deliberate choice: a local-first app whose pitch is that your data stays on your machine shouldn't call a Google CDN on every launch, and a desktop app served from `127.0.0.1` shouldn't need the internet to draw its own text. DM Sans ships as its variable font, so a single file covers the whole 300–700 range the UI uses. Both are OFL-1.1 and now appear in the generated third-party license notice.
- **No game artwork or avatar loaded at all — caused by the service worker introduced in 1.2.0.** That worker was added purely to make the page installable, and it called `event.respondWith(fetch(event.request))` on *every* request. Re-issuing a request as `fetch()` changes which CSP directive governs it: an `<img>` load is checked against `img-src` (which permits Steam's CDNs), but a `fetch()` is checked against `connect-src` — which is `'self'`. So the worker quietly rewrote every cross-origin image into a connection the app's own policy forbids, and the browser refused all of them:

  ```
  Fetch API cannot load https://cdn.../header.jpg.
  Refused to connect because it violates the document's Content Security Policy.  at sw.js
  ```

  The worker now ignores cross-origin requests entirely — it never had any reason to touch requests it wasn't going to do anything with.

  Undoing this on machines that already ran 1.2.0 took more than shipping a corrected worker. A service worker that's already installed keeps controlling the page regardless of what the new build does, and calling `unregister()` from the page only takes effect once every client has closed — so the first launch after updating would still have been broken. The desktop app now clears service-worker storage at the Electron session level before the window loads, so it comes up uncontrolled every time, whatever a previous version left behind.
- Steam artwork now falls back across CDN *hosts*, not just image paths. The five fallbacks for a cover image were five paths on `cdn.akamai.steamstatic.com` alone, so a single unreachable host would take out every image for every game with no recourse. They now rotate across `cloudflare`, `fastly` and `akamai` before degrading image shape, and the legacy `akamai` endpoint is no longer tried first. This was hardening rather than the cause of the outage above.
- `npm run build:electron` now works when the project lives in an indexed or synced folder (Desktop, Documents, OneDrive), where it previously failed with `EPERM … rename 'release/win-unpacked.tmp' -> 'release/win-unpacked'`. Packaging is staged under the OS temp directory by `tools/build-app.mjs` and the finished installers are copied into `release/`. The rename is blocked by a directory-change-notification handle — the kind Search Indexer, Defender and sync clients take on newly created folders — which stops a directory being renamed while leaving its contents readable; copying files is unaffected. Fixed in the build rather than by asking anyone to add an antivirus or indexing exclusion.
- Release artifacts are now named `Steam-Stats-Setup-<version>.exe` and `Steam-Stats-<version>-portable.exe`, pinned explicitly in `electron-builder.yml`. They previously derived from `productName`, which put a space in the filename — and GitHub silently rewrites spaces in release assets to dots, so the uploaded files came out as `Steam.Stats.Setup.1.2.0.exe` and no longer matched what the docs told people to download. (The v1.2.0 assets were renamed in place, so its download links are correct.) The display name is unchanged everywhere a user actually reads it; this only affects the file on disk.

## [1.2.0] - 2026-08-18

Steam Stats becomes a real desktop app.

### Added
- **Steam store links can open in the Steam desktop client** instead of a browser tab, via the `steam://` protocol Steam registers when it installs. On a game's detail panel, "View in Steam" now hands the store page straight to the client that's already running — where it can actually install the game — rather than bouncing through a browser. New toggle in **Settings → Local Steam Path**.
- The preference follows local-Steam detection by default (on when Steam was found, off when it wasn't) and is stored as a genuine three-state value: until you touch the toggle it stays on "auto", so connecting a Steam install later starts routing links to the client without needing you to go set anything. Once you choose explicitly, detection never overrides that choice again.
- The Steam API-key link shown during setup is deliberately left on the web — it's a logged-in account page, and belongs in the browser holding your session and password manager.
- **Installable from the browser too.** If you run Steam Stats from source (or just prefer a browser), Chrome and Edge now offer ⋮ → "Install Steam Stats", giving it its own window and taskbar icon without the desktop build. Implemented with a web app manifest, generated PNG icons, and a service worker that exists purely to satisfy the browser's installability check.
- That service worker **deliberately caches nothing**. Every asset is served from `127.0.0.1`, so there's no latency to cache away, and the app can't function without its local server — meaning there's no offline mode worth building toward, and a precache would only risk serving a previous build's JavaScript after an update. It's also skipped entirely in the desktop app, which is already installed and has no install prompt to earn.

### Changed
- **Steam Stats is now a real desktop app.** It ships as an Electron application — double-click and it opens in its own window, with its own taskbar icon. No `Start Steam Stats.bat`, no console window, no browser tab. Two downloads are produced: an installer (Start-menu and desktop shortcuts, clean uninstall) and a portable single `.exe` that runs with nothing installed at all.
- **The release no longer contains two copies of Node.** The previous packaging shipped a 75MB `pkg` executable whose only job was to spawn a separate 83MB `node.exe` — 158MB of the 165MB release folder was duplicated runtime, a leftover workaround for `pkg` being unable to run `server.js` directly. Electron's main process *is* Node, so `server.js` is simply imported and the duplication is gone.
- Trimmed a further ~75MB from the packaged app: `react`/`react-dom`/`concurrently` moved to `devDependencies` (they're compiled into the frontend bundle or used only by dev scripts, so shipping their dependency trees added ~27MB of `yargs`/`chalk`/`@babel` for nothing), and Electron's bundled locales were limited to `en-US` (the default ~50 locale files were 47MB of translations for an English-only app).
- The Express server was deliberately **not** rewritten to use Electron IPC. It still binds `127.0.0.1:3001` and the window loads it over HTTP, which keeps the Steam proxying, HowLongToBeat scraping and VDF parsing exactly as they were — and means the app still runs in an ordinary browser, and is still installable as a PWA, for anyone who prefers that.
- Your data is untouched by the migration: the app still reads and writes `%APPDATA%\SteamStats`, so existing config, snapshot history and caches carry straight over.

### Removed
- `bootstrap.cjs`, `build-release.js`, the `pkg` dependency, and the `build:release` / `build:exe` / `build:exe:win` scripts — all superseded by `npm run build:electron`. The third-party license notice that `build-release.js` generated lives on as `tools/generate-licenses.mjs`, still run on every packaged build.

## [1.1.0] - 2026-08-16

First public GitHub release.

### Added
- Persistent per-user data folder (`%APPDATA%\SteamStats`) for config, snapshot history, and API caches — survives app updates instead of living inside the release folder that gets replaced on every build.
- "Data & Cache" settings section: shows the data folder location with an Open Folder button, live cache counts, and a manual "Clear Cache" control for regenerable data (genre tags, achievement rarity %, HowLongToBeat lookups) — kept separate from the destructive "Clear Snapshots" / "Reset App" actions since nothing it clears is irreplaceable.
- Error boundary — a rendering crash now shows a recoverable screen instead of a blank page.
- MIT license, plus a `THIRD_PARTY_LICENSES.txt` generated automatically in every release build covering all bundled open-source packages.
- Focus-trapping and `role="dialog"` on modal dialogs (Settings, Share Card, detail panels), so keyboard navigation can't Tab out into the page behind them.
- `steamstats.localhost` as the app's real, working address — for the dev frontend (`:5173`), the API server (`:3001`), and the URL the packaged `.exe` auto-opens. Every `*.localhost` hostname is reserved by RFC 6761 and resolved straight to loopback by every modern browser, so this needed no hosts-file edit, no admin rights, and no per-machine setup — just friendlier URLs than raw `localhost:3001` everywhere the app already showed one. Plain `localhost` still works identically as a fallback. See the README's "Why `steamstats.localhost`?" section for why `.dev` (forced HTTPS via HSTS preload) and `.local` (reserved for mDNS/Bonjour) were the wrong picks here.

### Changed
- App context now only re-renders components that consume values which actually changed, instead of the whole app re-rendering on every state update.
- Muted text colors (`--ss-ink3`, `--ss-ink4`) adjusted across all four themes to meet WCAG AA contrast (4.5:1); most notably fixed in the light theme, where secondary text previously fell as low as 3.99:1.
- Added an explicit `:focus-visible` outline to buttons and pills so keyboard focus stays visible even inside rounded, `overflow: hidden` containers that can clip the browser's default focus ring.
- README and CLAUDE.md brought back in line with the actual app: the Backlog and Completion pages described in older docs are one merged "Progress" page/nav item; the History page is now built from Steam's own achievement-unlock timestamps rather than local daily snapshots (no minimum-history wait); Library's session-insight panel and launch-frequency scatter plot (removed in an earlier release, since Steam no longer exposes per-game launch counts) were still listed and have been dropped from the docs.
- First-run onboarding overhauled, in the app and in the README: a bad/inactive API key, a mistyped profile URL, and a private "Game details" setting used to all collapse into the same one or two generic error messages — now each gets its own targeted message pointing at what to actually fix. The Steam API proxy forwards Steam's real HTTP status instead of flattening every failure to a 500. Setup screen copy now names "Game details" specifically (a separate toggle from overall profile visibility that was easy to miss) and shows both supported profile-link formats.
- Dashboard now tells a genuinely empty library (0 games returned — almost always the Game details privacy toggle) apart from a quiet time period (0 games played *recently*, which is normal) — previously both rendered the same "no playtime data" message with no path forward. The empty-library state explains the likely cause and offers a Retry button.

### Removed
- Unused `chart.js` / `react-chartjs-2` dependencies — every chart in the app (donuts, bar charts, sparklines, recency lanes) is hand-rolled inline SVG and has been for a while; the packages were dead weight (~6MB in `node_modules`, not referenced anywhere in `src/`).
- Unused default Vite/React scaffold assets (`src/assets/react.svg`, `src/assets/vite.svg`).

### Fixed
- "Reset App" now also clears the HowLongToBeat and achievement localStorage caches, which it previously missed, leaving stale data behind after a reset.
- Custom Steam path override now persists across restarts — previously held only in memory and silently reset every launch.

### Security
- Server now binds to `127.0.0.1` only, not all network interfaces — previously reachable from any other device on the same network.
- Fixed a path-traversal gap in the local-artwork endpoint (`appId` is now validated as numeric before being used in a filesystem path).

## [1.0.0] - prior to this changelog

Initial version. No changelog was kept before this point — see git history for the full development record.
