# Steam Stats

Personal gaming analytics dashboard powered by the Steam Web API, HowLongToBeat, and (optionally) local Steam installation data.

## Stack

- **Frontend**: React 18 + Vite 5, Chart.js / react-chartjs-2 for charts. Plain CSS (`src/App.css`, `src/index.css`), no CSS framework.
- **Backend**: Express server (`server.js`) — hand-rolled HowLongToBeat scraper and VDF parser live here (no `howlongtobeat-core` or `vdf-parser` packages, those were removed as dead deps).
- **Dev run**: `npm run dev` — runs server (port 3001) + Vite frontend (port 5173) concurrently via `concurrently`.
- **Packaging**: `npm run build:release` → `build-release.js` bundles frontend + a minimal server-only `node_modules` + a standalone `node.exe` into `release/`, launched via `bootstrap.cjs` and a `tray-runner.cjs` (uses `systray2`) for a tray-icon-based distributable `.exe`. Package.json also has `pkg`-based single-target builds (`build:exe`, `build:exe:win`) but the release-folder approach is the documented/preferred distribution method (see README's "Why not a single file?" section).
- Node >= 22 required (`engines` in package.json).

## Project layout

- `src/pages/` — top-level routed views: Dashboard, Library, Backlog, Achievements, Completion, History.
- `src/components/` — shared UI pieces (Navbar, SettingsModal, SetupScreen, chart widgets, etc.).
- `src/hooks/useAppContext.jsx` — central app state/context (Steam data, caches like `achCache`).
- `src/utils/steam.js` — core stats/algorithm logic (streaks, percentiles, recommender) — not just API glue, treat as business logic.
- `server.js` — Express API server: Steam Web API proxy, local Steam install detection, HLTB scraping, VDF parsing.

## Conventions / notes

- Brand name is **"Steam Stats"** (with a space) in user-facing text — `SteamStats` (no space) as a literal string should not appear; watch for it creeping back into new UI copy.
- Data-driven features (Play Streak, Personal Percentile, "What Should I Play Tonight") rely on daily snapshot history accumulated over real usage — they intentionally return `null`/render nothing below minimum sample sizes (e.g. 7 days for daily percentile, 21 for weekly) rather than showing misleading numbers from small samples. Keep that "silent until meaningful" behavior when touching this code.
- When changing React state and needing the *updated* value synchronously within the same call (not just on next render), watch out for closure staleness — `useAppContext.jsx` had a real bug here (see `SESSION_NOTES.md` history) and uses a ref alongside `setAchCache` to sidestep it.
- No test framework is wired into `package.json` yet; algorithm changes (streaks, percentiles, recommender) have historically been verified with ad hoc synthetic test scripts rather than a committed test suite.
