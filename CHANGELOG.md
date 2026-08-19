# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versioning follows [SemVer](https://semver.org/).

## [Unreleased]

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
