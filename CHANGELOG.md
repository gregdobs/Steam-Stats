# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versioning follows [SemVer](https://semver.org/).

## [Unreleased]

## [1.1.0] - 2026-08-16

### Added
- Persistent per-user data folder (`%APPDATA%\SteamStats`) for config, snapshot history, and API caches — survives app updates instead of living inside the release folder that gets replaced on every build.
- "Data & Cache" settings section: shows the data folder location with an Open Folder button, live cache counts, and a manual "Clear Cache" control for regenerable data (genre tags, achievement rarity %, HowLongToBeat lookups) — kept separate from the destructive "Clear Snapshots" / "Reset App" actions since nothing it clears is irreplaceable.
- Error boundary — a rendering crash now shows a recoverable screen instead of a blank page.
- MIT license, plus a `THIRD_PARTY_LICENSES.txt` generated automatically in every release build covering all bundled open-source packages.
- Focus-trapping and `role="dialog"` on modal dialogs (Settings, Share Card, detail panels), so keyboard navigation can't Tab out into the page behind them.

### Changed
- App context now only re-renders components that consume values which actually changed, instead of the whole app re-rendering on every state update.
- Muted text colors (`--ss-ink3`, `--ss-ink4`) adjusted across all four themes to meet WCAG AA contrast (4.5:1); most notably fixed in the light theme, where secondary text previously fell as low as 3.99:1.
- Added an explicit `:focus-visible` outline to buttons and pills so keyboard focus stays visible even inside rounded, `overflow: hidden` containers that can clip the browser's default focus ring.

### Fixed
- "Reset App" now also clears the HowLongToBeat and achievement localStorage caches, which it previously missed, leaving stale data behind after a reset.
- Custom Steam path override now persists across restarts — previously held only in memory and silently reset every launch.

### Security
- Server now binds to `127.0.0.1` only, not all network interfaces — previously reachable from any other device on the same network.
- Fixed a path-traversal gap in the local-artwork endpoint (`appId` is now validated as numeric before being used in a filesystem path).

## [1.0.0] - prior to this changelog

Initial version. No changelog was kept before this point — see git history for the full development record.
