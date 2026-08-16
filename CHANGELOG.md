# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versioning follows [SemVer](https://semver.org/).

## [Unreleased]

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
