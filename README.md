# 🎮 Steam Stats

A personal gaming analytics dashboard powered by the Steam Web API, HowLongToBeat, and (optionally) your local Steam installation.

---

## Quick Start (Windows, no Node.js required)

Grab the latest build from **[Releases](../../releases/latest)**. Two options, both self-contained — there's nothing else to install:

- **`Steam-Stats-Setup-<version>.exe`** — installs it properly, with a Start-menu entry and desktop shortcut.
- **`Steam-Stats-<version>-portable.exe`** — a single file. Download, double-click, done. Nothing is installed.

**1.** Run whichever you downloaded. Steam Stats opens in its own window.

**2.** Get a free Steam Web API key at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) (use `localhost` as the domain name), and set your Steam profile to **Public** — in Steam: **Profile → Edit Profile → Privacy Settings → Game details → Public**. The app can't read your library otherwise.

**3.** Enter your API key and Steam profile URL when prompted (e.g. `https://steamcommunity.com/profiles/76561198044492736` or a vanity URL like `https://steamcommunity.com/id/yourname`).

Close the window to quit.

> **Windows will show a SmartScreen warning** ("Windows protected your PC") the first time you run it — expected for an unsigned free hobby project, not a sign of a problem. Click **"More info"** → **"Run anyway"**. Only appears once per machine.

Prefer to run from source instead (for development, or if you don't trust an unsigned `.exe`)? See **Running from Source** near the bottom of this README.

---

## Features

### ⊞ Dashboard
- Hero card for your most-played game, with full artwork
- Interactive time-breakdown donut — click segments to see game details
- Game grid with period vs. all-time comparison; toggle between **Last 2 Weeks** and **All Time** (7-Day and 30-Day periods are available as opt-in experimental toggles — see Settings → Display)
- **Play Streak** — current consecutive-day streak, with 2 "grace days" built in so a single missed day doesn't reset your progress. Builds up automatically from daily snapshots; needs a couple of days of use before it has anything to show.
- **Personal Percentile** — "Top 10% of your days" style framing, compared only against *your own* play history, never other players. Needs 7+ tracked days for a daily read, 21+ for a weekly one.
- **What Should I Play Tonight** — a random, unfiltered pick from anything with under 3 hours logged (untouched or barely started). Comes with 3 rerolls before it commits you to the answer.
- **Desktop vs. Deck** — what share of your all-time hours were played on Steam Deck, when that's ever been the case.

### 📅 Calendar
- Month grid of day-by-day playtime — click any day to see the hours split across games, plus the achievements you unlocked that day
- **Days are tri-stated, so a gap never poses as a zero.** A day is shown as played, as tracked-but-idle, or as *no coverage* — that last one meaning Steam Stats wasn't open to record it. Elsewhere in the app a missing day quietly reads as zero, which is harmless on a sparkline and misleading on a calendar
- A day's playtime is only pinned to that date when snapshots exist a day either side of it. Longer gaps hold a real total that can't be split honestly, so the days show the span total for context instead of a made-up daily figure — which is also what stops "days you happened to open the app" looking like your biggest gaming days
- Month rail with hours, days played, longest run, coverage, most-played games and anything you **started** that month; it switches to a single day's detail when you pick one
- Hover any achievement icon in a day's detail for what it was for and how many owners have it
- Filter the whole grid to one game to see exactly when you binged it
- **Month jump** — click the month name for a dropdown of every month on record, shaded by how many achievements you unlocked in each, with a dot marking the months that also have day-level playtime
- **Year-over-year** — any month can be compared against the same month a year earlier, hours and days played side by side
- Playtime history goes back as far as you've used the app, not a rolling window: the app keeps every day it ever recorded and the Calendar reads all of it. The achievement layer is dated by Steam and reaches back to your first unlock, so the page has something to show on day one too

### 📚 Library
- Library utilization donut (played vs. untouched) plus derived stats — median hours on a played game, % of hours in your top 10, top game's share of your total time
- "Time since last played" lanes — every played game bucketed by recency, dot size scaled to lifetime hours — click a dot to filter the table
- Top 15 bar chart by lifetime hours — click a bar to highlight in the table
- Genre allocation panel
- Full sortable game table with inline filter pills, cross-filterable from every chart on the page

### 📥 Progress
One page spanning your whole library, from untouched to overplayed:
- Status spectrum across 7 buckets (Unplayed → No Estimate → Barely Started → In Progress → Getting There → Completed → Overplayer), badged 📥 · ❔ · 💤 · 🎮 · 🔥 · 🏁 · 🐙 — click a segment to filter
- Backlog burn-down projection ("at your current pace, clearing your backlog would take ~X weeks") — uses real HowLongToBeat estimates where cached, falls back to a conservative flat estimate otherwise
- Backlog momentum — whether your unplayed count is growing or shrinking over the last couple weeks
- Backlog breakdown by genre
- Dormant longest — games you played and then set aside, ranked by how long it's been
- "Furthest along" spotlight — the games closest to (or past) their HowLongToBeat completion estimate
- Full game list, sortable by status, shortest-first, most playtime, or A–Z

### 🏆 Achievements
- Completion % for up to 100 games
- Rarest Unlocks — the achievements you've earned that the smallest share of other players have, pulled from Steam's global achievement stats
- Filter by Perfect / Almost / In Progress
- Global achievement stats

### 📈 History
- Achievement unlocks over time — a month-by-month trend line built from Steam's own achievement-unlock timestamps, not local tracking, so it's populated from day one
- "When you last touched each game" — every played game bucketed by last-played date
- "Your Steam years" — unlocks per year, broken down by your top games
- This is separate from the Dashboard's Play Streak / Personal Percentile and the Calendar's playtime layer, which do need a few days of local snapshot history to build up (see below)

---

## Settings

Click your **profile name** in the top-right corner to open Settings:

- **Steam Connection** — change API key or profile URL
- **Local Steam Path** — detected path, library folders, a manual override if auto-detection misses your install, and **Open Steam Links in the Steam App** (see below)
- **HowLongToBeat** — integration status and a test lookup
- **Display** — light/dark mode, plus **Feature Flags** for the experimental 7-Day and 30-Day dashboard periods (these use local snapshot data, so accuracy improves the longer you've had the app running — they're opt-in rather than on by default for that reason)
- **Data & Cache** — data folder location, snapshot count and log, **Backup Snapshots** (export/import your playtime history), clear snapshots, or reset the app entirely
- **Debug Info** — copy status info when reporting issues

### Open Steam Links in the Steam App

When Steam is detected on your PC, "View in Steam" on a game opens its store page **in the Steam desktop client** rather than a browser tab — the client is already running, and the store page there can actually install the game.

This follows detection automatically: on if Steam was found, off if it wasn't. Flip the toggle in **Settings → Local Steam Path** to force it either way; your choice sticks and won't be overridden by detection afterward.

The Steam API key link during setup deliberately stays in your normal browser — it's a logged-in account page, and that's where your session and password manager live.

---

## Where your data lives

Everything the app persists — your app config (API key, Steam ID, theme), snapshot
history, and the genre/rarity/HowLongToBeat caches — is kept in one folder outside
the app's install directory:

- Windows: `%APPDATA%\SteamStats`
- macOS: `~/Library/Application Support/SteamStats`
- Linux: `$XDG_DATA_HOME/SteamStats` or `~/.local/share/SteamStats`

Because it lives outside the app's install directory, it's untouched when you
update — install the new version (or swap in the new portable `.exe`) and
everything carries over. **Settings → Data & Cache → Open Folder** takes you
straight there.

App config and snapshot history are also kept in your browser's `localStorage`
for fast reads, but that copy is only a working set — the data folder is the
durable one. On startup the app pulls any history the folder has that the
browser profile doesn't, so a cleared profile, a new machine, or a changed port
restores rather than starts over.

**Snapshot history is the one thing here that can't be re-fetched.** Steam's API
reports lifetime totals, not sessions, so a day that was never recorded is gone
for good — unlike the caches, which just re-download. Two things follow from
that:

- `snapshots.json` keeps **everything**, not the 90 days `localStorage` holds. It's
  delta-encoded (only the games whose playtime moved are stored per day), so a
  day costs a few hundred bytes rather than tens of kilobytes.
- **Settings → Data & Cache → Backup Snapshots** exports the full archive to a
  file and imports one back. Import merges — it can only add days you're missing,
  never remove days you already have.

---

## Local Steam Data (optional, unlocks extra stats)

On startup, the server checks a list of common Windows install locations and uses the first one it finds:

- `C:\Program Files (x86)\Steam`
- `C:\Program Files\Steam`
- `D:\Steam` / `D:\Games\Steam`
- `E:\Steam` / `E:\Games\Steam`
- `G:\Steam` / `G:\Games\Steam`
- `%USERPROFILE%\Steam`

If your install lives somewhere else, set it manually in **Settings → Local Steam Path** — there's a "Test" button to validate the folder before applying it.

| Data | What it unlocks |
|---|---|
| Last played timestamps | More accurate than the Steam API's |
| Your custom tags | Shown on game cards |

None of this is required — the app works fully off the Steam Web API alone, local data just fills in a few extra stats.

---

## Troubleshooting

**"Cannot GET /"** on port 3001 — this is normal, that's the API server. Open port 5173 instead.

**`steamstats.localhost` won't load** — this shouldn't happen on any current browser, but if it does, plain `http://localhost:5173` (dev) or `http://localhost:3001` (packaged app) opens the identical app.

**"Steam rejected this API key"** — the key is wrong, or (if you just generated it) hasn't finished activating yet; give it a minute and retry. Double-check it at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey).

**"No Steam profile found for ..."** — the profile URL or ID doesn't resolve to an account. This is almost always a typo or a copy-paste issue, not a privacy setting — try your full profile URL instead of a vanity name.

**"Steam connected, but your library came back empty"** — this means **Game details** is still Private. That's a separate toggle from overall profile visibility: **Profile → Edit Profile → Privacy Settings → Game details → Public** (see Quick Start step 2), then hit Retry.

**HowLongToBeat shows no data** — HLTB occasionally blocks automated requests. Try:
1. Open [howlongtobeat.com](https://howlongtobeat.com) in your browser first
2. Restart Steam Stats (close the window, then launch it again)
3. Check **Settings → HowLongToBeat → Test** for details

**Genre data is slow to fill in** — genres are fetched from the Steam Store API one at a time with a short delay between requests to avoid rate limits, so a big library can take a few minutes to fully populate on first load. It's cached after that.

**Play Streak / Personal Percentile aren't showing anything** — these need a few days of actual use to build up snapshot history (2+ days for a streak, 7+ for a daily percentile, 21+ for a weekly one). Nothing's wrong — there's just not enough history yet.

**Port already in use** — another process is using 5173 or 3001. Stop it with:
```
npx kill-port 5173
npx kill-port 3001
```

**Steam not found** — go to **Settings → Local Steam Path** for diagnostics and a manual override.

---

## A note on HowLongToBeat

HowLongToBeat doesn't offer a public API, so this app talks to an internal endpoint their own website uses — the same approach any unofficial HLTB integration takes. It's unofficial, best-effort, and can break if HLTB changes their site; when it does, completion-time estimates just won't show up rather than the app failing. There's a manual token override in **Settings → HowLongToBeat** as a fallback if auto-detection stops working.

---

## Running from Source

**1. Install Node.js** — [nodejs.org](https://nodejs.org), LTS version. Run the installer (Next → Next → Finish).

**2. Clone the repo and install dependencies** (one time):
```
git clone https://github.com/gregdobs/Steam-Stats.git
cd Steam-Stats
npm install
```

**3. Get a free Steam Web API key** at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey). Use `localhost` as the domain name.

**4. Set your Steam profile to Public** — in Steam: **Profile → Edit Profile → Privacy Settings → Game details → Public**. The app can't read your library otherwise.

**5. Start the app:**
```
npm run dev
```
This runs the API server and the frontend together in a single terminal window. Once it's up, open:
```
http://steamstats.localhost:5173
```
and enter your API key and Steam profile URL (e.g. `https://steamcommunity.com/profiles/76561198044492736` or a vanity URL like `https://steamcommunity.com/id/yourname`).

**6. Stop the app** — `Ctrl + C` in that terminal.

That's the whole loop day-to-day: `npm run dev`, use the app, `Ctrl+C` when done.

> `steamstats.localhost` is a real, working address, not a typo to fix — every modern browser resolves any `*.localhost` hostname straight to your own machine, no setup required. Plain `http://localhost:5173` opens the exact same app if you'd rather use that.

**Developing against the desktop shell instead:**
```
npm run dev:electron
```
This starts Vite and opens the Electron window pointed at it, so hot reload still works while you're seeing the real app window. Plain `npm run dev` stays the faster loop for pure UI work — the app runs identically in a browser, which is the whole reason the Express server wasn't replaced with IPC.

---

### Alternate: running the server and frontend separately

Useful for troubleshooting one side without restarting the other. Open two terminal windows:

**Window 1 — API server:**
```
cd path\to\steam-dashboard
node server.js
```
You should see:
```
🎮 Steam Stats Server running on http://steamstats.localhost:3001 (also reachable at http://localhost:3001)
✅ Steam installation found: C:\Program Files (x86)\Steam
```

**Window 2 — frontend:**
```
cd path\to\steam-dashboard
npx vite --port 5173
```
You should see:
```
  VITE v5.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```
(Vite's own banner always prints plain `localhost` — `http://steamstats.localhost:5173` still works against it, see below.)

Then open `http://steamstats.localhost:5173` as before. Each window needs Ctrl+C separately to stop.

| URL | What it is |
|---|---|
| http://steamstats.localhost:5173 | The dashboard — open this in your browser |
| http://steamstats.localhost:3001 | API server — you never need to open this directly |

Both are equally reachable as plain `http://localhost:5173` / `:3001` — `steamstats.localhost` is just the friendlier name the app itself uses (loaded by the packaged app's window, printed by the server on startup).

---

### Running tests

Algorithm logic (streaks, percentiles, snapshot-derived series) has a [Vitest](https://vitest.dev) suite in `src/utils/steam.test.js`:
```
npm test
```

---

## Building a Distributable App

**One-time setup** (already done if you cloned this repo):
```
npm install
```

**Build:**
```
npm run build:electron
```

This builds the frontend, regenerates the third-party license notice, then runs `electron-builder` (config in `electron-builder.yml`). Two artifacts land in `release/`:

| Artifact | What it's for |
|---|---|
| `Steam-Stats-Setup-<version>.exe` | Installer — Start-menu and desktop shortcuts, choose install location, clean uninstall. ~88MB. |
| `Steam-Stats-<version>-portable.exe` | Single self-contained file. Download and run, no install. ~88MB. |

Either one is the whole app: Electron bundles Node, so there's nothing for the recipient to install.

**Windows will show a SmartScreen warning ("Windows protected your PC")** on first run. The executable isn't code-signed (a certificate costs money and this is a free hobby project), so Windows doesn't recognize the publisher yet. Click **"More info"** → **"Run anyway"**. This is realistically the single largest bit of onboarding friction the app has — much more than download size — so code signing is the highest-leverage improvement if that ever matters.

### Why the build stages through a temp folder

`build:electron` runs electron-builder with its output under your OS temp directory, then copies the finished installers into `release/`. That's deliberate.

electron-builder extracts the Electron runtime to `win-unpacked.tmp` and renames it to `win-unpacked`. On Windows that rename fails with `EPERM` whenever something holds a directory-change-notification handle on the new folder — which Search Indexer, Defender and file-sync clients all do for indexed locations like Desktop, Documents and OneDrive folders. Since this project is likely to live in exactly such a folder, the build stages somewhere unwatched instead of asking you to weaken an antivirus or indexing setting.

Copying the finished files back is unaffected, so `release/` ends up with the same artifacts either way. The unpacked app stays in the staging folder for debugging; the build prints its path at the end.

---

## License

[MIT](LICENSE) — free to use, modify, and distribute. See [CHANGELOG.md](CHANGELOG.md) for release history, and the release folder's `THIRD_PARTY_LICENSES.txt` for the open-source packages it bundles.
