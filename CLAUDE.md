# Steam Stats

Personal gaming analytics dashboard powered by the Steam Web API, HowLongToBeat, and (optionally) local Steam installation data.

## Stack

- **Frontend**: React 18 + Vite 5. All charts (donuts, bar charts, sparklines, scatter/lane plots) are hand-rolled inline SVG — no charting library. Plain CSS (`src/index.css`), no CSS framework.
- **Backend**: Express server (`server.js`) — hand-rolled HowLongToBeat scraper and VDF parser live here (no `howlongtobeat-core` or `vdf-parser` packages, those were removed as dead deps).
- **Dev run**: `npm run dev` — runs server (port 3001) + Vite frontend (port 5173) concurrently via `concurrently`. Both are reachable at `steamstats.localhost:<port>` as well as plain `localhost:<port>` — see the `.localhost` convention note below.
- **Packaging**: `npm run build:release` → `build-release.js` bundles frontend + a minimal server-only `node_modules` + a standalone `node.exe` into `release/`, launched via `bootstrap.cjs` and a visible-console `Start Steam Stats.bat`. (A tray-icon/hidden-console launcher via `systray2` was tried and removed — added complexity and an untested code path for a solo-use local app; the plain console window is simpler to debug.) Package.json also has `pkg`-based single-target builds (`build:exe`, `build:exe:win`) but the release-folder approach is the documented/preferred distribution method (see README's "Why not a single file?" section).
- Node >= 22 required (`engines` in package.json).

## Project layout

- `src/pages/` — top-level routed views: Dashboard, Library, Progress (backlog burn-down + completion status, merged into one page/nav item despite the filename split implied by older docs), Achievements, History.
- `src/components/` — shared UI pieces (Navbar, SettingsModal, SetupScreen, chart widgets, etc.).
- `src/hooks/useAppContext.jsx` — central app state/context (Steam data, caches like `achCache`).
- `src/utils/steam.js` — core stats/algorithm logic (streaks, percentiles, recommender) — not just API glue, treat as business logic. Covered by `src/utils/steam.test.js`.
- `server.js` — Express API server: Steam Web API proxy, local Steam install detection, HLTB scraping, VDF parsing.

## Documentation maintenance

Docs drifted badly once already — pages got merged/renamed, features got removed, a dependency became dead weight, and README/CLAUDE.md kept describing the old state for weeks until a dedicated cleanup pass caught it (see CHANGELOG `[Unreleased]`, doc-polish entry). Treat doc updates as part of the change itself, done in the same commit, not a follow-up task.

**When a change falls into one of these, update the doc(s) listed — right then, not later:**

| Change | Update |
|---|---|
| Add/remove/rename/merge a page or route (`src/pages/`, `App.jsx`'s `PageContent` switch, Navbar's `NAV_ITEMS`) | README `## Features` (that page's section); CLAUDE.md `## Project layout` |
| Add/remove a user-facing feature, panel, or chart within a page | README's bullet list for that page |
| Change what data a feature is derived from (e.g. local snapshots → live API, or vice versa) — especially anything affecting "needs N days of history" gating | README's description of that feature; CLAUDE.md's data-gating note in `## Conventions / notes` |
| Add an npm dependency | Actually import it somewhere before merging — a listed-but-unused dep is exactly what caused the `chart.js`/`react-chartjs-2` cleanup |
| Remove an npm dependency | `grep -rl "<pkg>"` across `src/` and `server.js` first to confirm it's dead, then also check `build-release.js`'s `FRONTEND_BUNDLED_DEPS`/`SERVER_RUNTIME_DEPS` lists and the `## Stack` line in this file |
| Add/remove/rename a Settings modal section or tab | README `## Settings` |
| Any user-visible change worth telling someone updating the app about | CHANGELOG `[Unreleased]` — add the entry now, not retroactively at release time |

**Before calling a feature/change done:** `grep -n "<old name/behavior>" README.md CLAUDE.md` for whatever you just renamed, removed, or changed the behavior of (component name, page label, emoji badge list, data-source description, dependency name). A stale doc claim never shows up in a code diff review — the grep is the only thing that catches it.

## Conventions / notes

- Brand name is **"Steam Stats"** (with a space) in user-facing text — `SteamStats` (no space) as a literal string should not appear; watch for it creeping back into new UI copy.
- Data-driven features (Play Streak, Personal Percentile, "What Should I Play Tonight") rely on daily snapshot history accumulated over real usage — they intentionally return `null`/render nothing below minimum sample sizes (e.g. 7 days for daily percentile, 21 for weekly) rather than showing misleading numbers from small samples. Keep that "silent until meaningful" behavior when touching this code. The History page is the exception: it's built from Steam's own achievement-unlock timestamps rather than local snapshots, so it has real data from day one with no minimum-sample gating.
- When changing React state and needing the *updated* value synchronously within the same call (not just on next render), watch out for closure staleness — `useAppContext.jsx` had a real bug here (see git history on that file) and uses a ref alongside `setAchCache` to sidestep it.
- Local Steam data can no longer supply per-game launch counts — modern `localconfig.vdf` doesn't write a `LaunchCount` field (verified against a real install; see git history on `SessionInsights` removal). `server.js` still parses the field defensively (falls back to `null`), and a few UI spots (`GameDetailPanel`, Dashboard's session-count line, Settings debug info) still read `game.launchCount` and silently render nothing — don't be surprised if it's always empty.
- `vitest` is wired into `package.json` (`npm test`); `src/utils/steam.test.js` covers algorithm functions in `steam.js` (streaks, percentiles, snapshot-derived series, unlock aggregation). Extend that file rather than reaching for ad hoc scripts when touching this logic.
- **`steamstats.localhost` is the app's real, intended address, not a placeholder or typo.** `*.localhost` is reserved by RFC 6761 and every modern browser resolves it to loopback with zero setup — no hosts file, no admin rights. `bootstrap.cjs` auto-opens it, `server.js`'s startup log prints it, and the README leads with it. Plain `localhost` is kept deliberately in exactly one place — `bootstrap.cjs`'s internal `waitForServerReady` health poll — because that's a Node-to-Node call, not a browser navigation, and the `.localhost`-resolves-to-loopback behavior is a browser convention Node's own resolver isn't guaranteed to share. If you add a new place that opens or prints a URL for the *user* to see/click, use `steamstats.localhost`; if you add internal (non-browser) request code, use plain `localhost`. If you ever change the dev or server port, update it in all four places at once: `bootstrap.cjs` (health-check URL + opened URL), `server.js` (startup log + the `cors()` origin allowlist, which hardcodes both the plain and `steamstats.localhost` variants of each port), and the README.
- **"Game details → Public" is a separate Steam privacy toggle from overall profile visibility**, and it's the actual gate on `GetOwnedGames` (a private profile still returns a player object from `GetPlayerSummaries`, just an empty games list). This was a real onboarding footgun — a bad API key, a mistyped profile URL, and this toggle being off used to all surface as the same one or two generic error messages. Now: `server.js`'s `forwardSteamError` forwards Steam's real HTTP status (401/403 → bad key, network failure → unreachable) instead of a flat 500; `useAppContext.jsx` distinguishes "no profile found" (bad URL/ID) from a genuinely empty library; `Dashboard.jsx`'s `EmptyLibraryState` catches the empty-library case specifically. Keep new Steam-connection error paths this specific rather than collapsing them back into one message.
