# SteamStats — Cleanup + §5 Roadmap Rebuild

All 7 files below are drop-in replacements at the same paths in your repo.
Nothing else needs to change.

## Cleanup

- **`package.json`** — removed `howlongtobeat-core` and `vdf-parser`.
  Neither is imported anywhere; `server.js` has its own hand-rolled HLTB
  scraper and VDF parser. Also removed `open`, which isn't imported either
  (browser-opening goes through raw `execFile('start'/'open'/'xdg-open')`
  calls in `server.js` and `tray-runner.cjs`).
- **`build-release.js`** — dropped `open` from `SERVER_RUNTIME_DEPS`, so
  release builds stop bundling it.
- **`src/hooks/useAppContext.jsx`** — fixed a staleness bug in
  `getAchievementsForGames`: it was returning the `achCache` value from the
  closure at call time, which doesn't reflect the `setAchCache` updates made
  *during* that same call (React state updates aren't visible in the
  closure that scheduled them). Nothing currently breaks from this since
  callers only use `.finally()`, but a future `const data = await
  getAchievementsForGames(...)` would've silently gotten stale data. Fixed
  with a ref that's updated synchronously alongside each `setAchCache` call.

## §5 rebuild

**Important:** the original §5 implementation was lost in the container
reset documented in `PROJECT_STATUS.md` §7. This isn't a restore — it's a
fresh implementation from the documented design and algorithm notes. Where
the status doc didn't specify enough detail to be sure I matched the
original exactly, I've called that out in code comments.

- **`src/utils/steam.js`** — added:
  - `computeTodayPercentile` / `computeWeeklyPercentile` (§5.1 Personal
    Percentile) — "Top X% of your days/weeks" framed against the user's own
    history. Returns `null` below the minimum sample size (7 days / 21 days)
    rather than a misleading number from a tiny sample.
  - `computePlayStreak` (§5.2 Play Streak with Forgiveness) — 2 grace days
    absorb missed days without resetting *or inflating* the streak. Carries
    forward the documented off-by-one fix (normalize to midnight before
    comparing), **and fixes a second, related boundary bug I found while
    writing synthetic tests for this rebuild**: the walk was reaching the
    very first raw snapshot — which can never have a computed delta, since
    there's no earlier snapshot to diff it against — and incorrectly
    burning a grace day on it even for a perfectly clean streak. See the
    code comment and the test log below.
  - `recommendTonight` (§5.3 "What Should I Play Tonight") — filters the
    backlog by time budget and/or genre using data already in the shared
    HLTB/genre caches; fetches nothing new itself. This one had no lost
    implementation to reconstruct (status doc listed it as "designed, not
    yet implemented"), so this is its first real version.
  - Note: **§5.4 (Input Method Split) is not touched** — the status doc
    marks it "researched and rejected, not buildable" (Steam doesn't expose
    controller-vs-keyboard data to third-party apps), so there's nothing to
    rebuild there.
- **`src/components/StreakAndPercentile.jsx`** *(new)* — compact Dashboard
  card for the streak + percentile stats. Deliberately low-key (small text,
  no confetti/celebration styling) and renders nothing until there's enough
  snapshot history to say something meaningful — consistent with the
  project's own stated reasoning for avoiding GitHub-style streak pressure.
- **`src/components/TonightPick.jsx`** *(new)* — the recommender widget:
  time-budget pills, an optional genre dropdown (populated from whatever
  genre data's already cached), and a grid of results.
- **`src/pages/Dashboard.jsx`** — wired both new components in: streak card
  at the top, Tonight-pick between the hero card and the "Also Played" grid.

## Verification

I ran the same kind of synthetic tests the original session used (per
`PROJECT_STATUS.md` §4's testing approach) rather than trusting the logic
by inspection. 13 tests total, covering:

- A clean multi-day streak counts correctly with zero grace days spent
- A single missed day bridges via one grace day without inflating the count
- Missed days beyond the grace budget correctly end the streak
- Percentile returns `null` below the minimum sample size (both daily and
  weekly)
- Percentile correctly identifies both a highest-percentile and a
  lowest-percentile day
- The Tonight recommender respects a time budget (excluding both
  too-long and unknown-length games) and sorts shortest-known-first

First run caught a real bug (the grace-day boundary issue described above)
— all 13 pass after the fix. Test script isn't included here since it's
scaffolding, not app code, but the logic it exercises is now in
`steam.js` with the bug-fix reasoning left in comments for anyone touching
this code later.
