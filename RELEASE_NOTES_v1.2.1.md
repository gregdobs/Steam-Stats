# Steam Stats v1.2.1

A personal gaming analytics dashboard for your Steam library. It runs entirely on your own PC — your API key, your playtime history and your snapshots never leave the machine.

**A maintenance release.** Game artwork now loads reliably, the app finally renders in its intended typeface, and startup tells you what it's doing instead of sitting silent. If you're on 1.2.0, this is worth grabbing.

---

## Download

| File | Use this if… |
|---|---|
| **`Steam-Stats-Setup-1.2.1.exe`** | You want it installed properly — Start-menu entry, desktop shortcut, clean uninstall. |
| **`Steam-Stats-1.2.1-portable.exe`** | You just want to run it. One file, nothing installed, delete it when you're done. |

Windows 10/11, 64-bit. Nothing else to install — Node.js is bundled.

> **Windows will show a SmartScreen warning** ("Windows protected your PC") the first time you run it. That's expected for a free, unsigned hobby project, not a sign of a problem. Click **More info** → **Run anyway**. It only appears once.

---

## What Steam Stats does

### ⊞ Dashboard
Your at-a-glance view: a hero card for your most-played game, an interactive time-breakdown donut, and a game grid comparing a recent period against all time.

- **Play Streak** — consecutive days played, with 2 built-in grace days so one missed evening doesn't wipe your progress
- **Personal Percentile** — "top 10% of your days," measured only against *your own* history, never other players
- **What Should I Play Tonight** — a random pick from anything under 3 hours logged, with 3 rerolls
- **Desktop vs. Deck** — how much of your lifetime playtime happened on a Steam Deck

### 📚 Library
Utilization at a glance — played vs. untouched, median hours on a played game, what share of your time sits in your top 10.

- "Time since last played" lanes, every game bucketed by recency with dot size scaled to lifetime hours
- Top 15 by lifetime hours, genre allocation, and a full sortable table
- Every chart cross-filters the table — click a segment, bar or dot to drill in

### 📥 Progress
Your whole library on one page, from untouched to overplayed.

- A 7-bucket status spectrum: Unplayed → No Estimate → Barely Started → In Progress → Getting There → Completed → Overplayer
- **Backlog burn-down** — "at your current pace, clearing your backlog would take ~X weeks," using real HowLongToBeat estimates where available
- **Backlog momentum** — whether your unplayed pile is growing or shrinking
- **Dormant longest** — games you started and quietly abandoned, ranked by how long ago
- **Furthest along** — the games closest to their completion estimate, i.e. the ones actually worth finishing

### 🏆 Achievements
Completion percentages across your library, filterable by Perfect / Almost / In Progress — plus **Rarest Unlocks**, the achievements you own that the smallest share of other players have earned.

### 📈 History
A month-by-month trend of your achievement unlocks, built from Steam's own unlock timestamps — so it's fully populated the day you install, with no waiting period. Also shows when you last touched each game, and your unlocks broken down by year.

---

## First-time setup

1. **Run the app.** It opens in its own window.
2. **Get a free Steam Web API key** at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) — use `localhost` as the domain name.
3. **Set Game details to Public** in Steam: **Profile → Edit Profile → Privacy Settings → Game details → Public**. This is a separate toggle from overall profile visibility and is the most common reason a library comes back empty.
4. **Paste your API key and profile URL** when prompted.

A few features (Play Streak, Personal Percentile, backlog momentum) build from daily snapshots and need a few days of real use before they show anything. They stay hidden rather than showing you a misleading number from three data points. Everything else works immediately.

---

## What's new in 1.2.1

### Game artwork loads again
In 1.2.0 no game art or profile picture loaded at all — every tile was a placeholder. The cause was the service worker added in that release to make the app installable: it intercepted every image request and re-issued it in a form the app's own security policy refused, so the browser blocked all of them.

The worker no longer touches those requests, and the desktop app now clears any copy 1.2.0 left behind when it starts. That second part matters — an installed service worker keeps running even after an update replaces it, so without it the fix wouldn't have reached anyone upgrading.

Artwork also now falls back across Steam's three interchangeable image servers rather than depending on one, so a single provider having a bad day can't blank your whole library.

### The app renders in its real typeface
Steam Stats is designed around DM Sans and DM Mono, but every packaged build had been quietly falling back to the default system font — the app's own security policy was refusing the external stylesheet the fonts were loaded from.

Both fonts now ship inside the app. Beyond fixing the look, this means Steam Stats no longer contacts a Google server on launch, which is the behaviour you'd expect from an app that keeps everything local, and the text renders with no internet connection at all.

### Startup tells you what it's doing
Launching used to show nothing until the window was ready — most noticeable with the portable build, which unpacks itself before anything appears. A small loading window now shows up immediately and reports progress while the local server starts.

### Also fixed
- Building from source now works when the project lives in a Desktop, Documents or OneDrive folder, where packaging previously failed outright.
- Download filenames are stable and predictable (`Steam-Stats-Setup-1.2.1.exe`), rather than being silently rewritten on the way to the releases page.

Upgrading from 1.2.0 or 1.1.0 keeps all your data — config, snapshot history and caches are untouched.

---

## Notes

- **Not code-signed.** Hence the SmartScreen prompt above. Signing certificates cost money and this is a free project.
- **Local only by design.** The app reads your local Steam install for extra detail, and its server binds to `127.0.0.1` only — it is not reachable from other devices on your network, and there's no hosted version.
- **HowLongToBeat is unofficial.** HLTB has no public API, so completion estimates come from the endpoint their own site uses. If they change it, estimates quietly stop appearing rather than breaking the app.

Full technical detail in [CHANGELOG.md](CHANGELOG.md).
