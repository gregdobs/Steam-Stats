# 🎮 SteamStats

A personal gaming analytics dashboard powered by the Steam Web API, HowLongToBeat, and (optionally) your local Steam installation.

---

## Quick Start (Windows)

**1. Install Node.js** — [nodejs.org](https://nodejs.org), LTS version. Run the installer (Next → Next → Finish).

**2. Install dependencies** (one time, from the project folder):
```
cd path\to\steam-dashboard
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
http://localhost:5173
```
and enter your API key and Steam profile URL (e.g. `https://steamcommunity.com/profiles/76561198044492736` or a vanity URL like `https://steamcommunity.com/id/yourname`).

**6. Stop the app** — `Ctrl + C` in that terminal.

That's the whole loop day-to-day: `npm run dev`, use the app, `Ctrl+C` when done.

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
🎮 Steam Dashboard Server running on http://localhost:3001
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

Then open `http://localhost:5173` as before. Each window needs Ctrl+C separately to stop.

| URL | What it is |
|---|---|
| http://localhost:5173 | The dashboard — open this in your browser |
| http://localhost:3001 | API server — you never need to open this directly |

---

## Features

### ⊞ Dashboard
- Hero card for your most-played game, with full artwork
- Interactive time-breakdown donut — click segments to see game details
- Game grid with period vs. all-time comparison; toggle between **Last 2 Weeks** and **All Time** (7-Day and 30-Day periods are available as opt-in experimental toggles — see Settings → Display)
- **Play Streak** — current consecutive-day streak, with 2 "grace days" built in so a single missed day doesn't reset your progress. Builds up automatically from daily snapshots; needs a couple of days of use before it has anything to show.
- **Personal Percentile** — "Top 10% of your days" style framing, compared only against *your own* play history, never other players. Needs 7+ tracked days for a daily read, 21+ for a weekly one.
- **What Should I Play Tonight** — an instant recommender over your unplayed backlog, filterable by how much time you have and by genre, ranked by known HowLongToBeat length where available.

### 📚 Library
- Genre allocation and session-insight panels (session data requires local Steam data — see below)
- Playtime distribution donut — click a bucket to filter the game table
- Top 15 bar chart — click a bar to highlight in the table
- Launch frequency vs. hours scatter plot — click a dot to filter
- Full sortable game table with inline filter pills

### 📥 Backlog
- Unplayed games list with a burn-down projection ("at your current pace, clearing your backlog would take ~X weeks") — uses real HowLongToBeat estimates where cached, falls back to a conservative flat estimate otherwise
- Backlog momentum — whether your unplayed count is growing or shrinking over the last couple weeks
- Backlog breakdown by genre
- "Pick for me" randomizer

### 🏆 Achievements
- Completion % for up to 100 games
- Filter by Perfect / Almost / In Progress
- Global achievement stats

### 🎯 Completion
- Your playtime vs. HowLongToBeat estimates
- Badges: 💤 Barely Started · 🎮 In Progress · 🔥 Getting There · 🏁 Completed · 🐙 Overplayer

### 📈 History
- Trend line chart from cached daily snapshots
- 52-week activity heatmap
- Gets richer every day you open the app — this is also what powers the Dashboard's streak and percentile stats

---

## Settings

Click your **profile name** in the top-right corner to open Settings:

- **Steam Connection** — change API key or profile URL
- **Local Steam Path** — detected path, library folders, and a manual override if auto-detection misses your install
- **HowLongToBeat** — integration status and a test lookup
- **Display** — light/dark mode, plus **Feature Flags** for the experimental 7-Day and 30-Day dashboard periods (these use local snapshot data, so accuracy improves the longer you've had the app running — they're opt-in rather than on by default for that reason)
- **Data & Cache** — snapshot count, clear snapshots, or reset the app entirely
- **Debug Info** — copy status info when reporting issues

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
| Launch count per game | "Launched 47×" stat, scatter plot, average-session-length estimate |
| Last played timestamps | More accurate than the Steam API's |
| Your custom tags | Shown on game cards |

None of this is required — the app works fully off the Steam Web API alone, local data just fills in a few extra stats.

---

## Building a Distributable .exe

Package the whole app into a folder anyone can run by double-clicking — no Node.js install required on their end.

**One-time setup** (already done if you cloned this repo):
```
npm install
```

**Build the release:**
```
npm run build:release
```

This runs everything automatically:
1. Builds the frontend (`npm run build`)
2. Compiles `bootstrap.cjs` into `SteamStats.exe` via pkg
3. Downloads a standalone `node.exe` to bundle alongside it (needed so the packaged app doesn't try to relaunch itself — only happens once, cached afterward)
4. Copies `server.js`, `tray-runner.cjs`, and the built frontend alongside it
5. Installs a minimal, server-only `node_modules` — just `express`, `cors`, `helmet`, `axios`, and `systray2`, not the full frontend dev dependency tree
6. Writes the launchers and a `README.txt` for whoever you send it to

Output lands in `release/`. Zip that whole folder — that's the distributable.

**Running it:** double-click **`Start SteamStats.vbs`** — no console window appears, but a tray icon shows up near the clock, and a browser tab opens automatically. Right-click the tray icon for Open/Quit. If something's not working and you want to see what's happening, use **`Start SteamStats (debug).bat`** instead — it keeps a visible console window with logs.

**Why not a single file?** pkg's executable alone can't reliably include `node_modules` (native bindings, dynamic requires, and file-size bloat make that fragile). Shipping `server.js` + `dist/` + a minimal `node_modules` alongside a small bootstrap `.exe` is the standard, reliable pattern — the folder is still just one download, one zip, one double-click for whoever you send it to.

**First build note:** the very first time you run `build:release`, pkg downloads a prebuilt Node.js binary (~40–80MB) to embed in the executable, and the script separately downloads a standalone `node.exe` for the release folder. Both need normal internet access and only happen once — pkg's download is cached in `~/.pkg-cache` afterward.

> **Heads up:** the tray icon and hidden-console behavior are implemented defensively (with a fallback to the visible debug launcher if tray init fails) but haven't been verified hands-on on a real Windows machine yet — only built and reasoned through. Worth a real test run before sending a release to anyone else.

---

## Troubleshooting

**"Cannot GET /"** on port 3001 — this is normal, that's the API server. Open port 5173 instead.

**"Profile not found"** — set your Steam Game Details privacy to Public (see Quick Start step 4).

**HowLongToBeat shows no data** — HLTB occasionally blocks automated requests. Try:
1. Open [howlongtobeat.com](https://howlongtobeat.com) in your browser first
2. Restart the app (Ctrl+C, then `npm run dev` again)
3. Check **Settings → HowLongToBeat → Test** for details

**Genre data is slow to fill in** — genres are fetched from the Steam Store API one at a time with a short delay between requests to avoid rate limits, so a big library can take a few minutes to fully populate on first load. It's cached after that.

**Play Streak / Personal Percentile aren't showing anything** — these need a few days of actual use to build up snapshot history (2+ days for a streak, 7+ for a daily percentile, 21+ for a weekly one). Nothing's wrong — there's just not enough history yet.

**Port already in use** — another process is using 5173 or 3001. Stop it with:
```
npx kill-port 5173
npx kill-port 3001
```

**Steam not found** — go to **Settings → Local Steam Path** for diagnostics and a manual override.
