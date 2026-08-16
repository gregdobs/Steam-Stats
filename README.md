# 🎮 Steam Stats

A personal gaming analytics dashboard powered by the Steam Web API, HowLongToBeat, and (optionally) your local Steam installation.

---

## Download (Windows, no Node.js required)

The fastest way to get running — no Node.js install, no `npm`, no terminal commands:

**1.** Grab the latest zip from **[Releases](../../releases/latest)** and unzip it anywhere.

**2.** Double-click **`Start Steam Stats.bat`**. A console window shows startup logs, and your browser opens automatically to the app.

**3.** Get a free Steam Web API key at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) (use `localhost` as the domain name), and set your Steam profile to **Public** — in Steam: **Profile → Edit Profile → Privacy Settings → Game details → Public**. The app can't read your library otherwise.

**4.** Enter your API key and Steam profile URL when prompted (e.g. `https://steamcommunity.com/profiles/76561198044492736` or a vanity URL like `https://steamcommunity.com/id/yourname`).

Close the console window to stop the app; double-click the `.bat` again to relaunch.

> **Windows will show a SmartScreen warning** ("Windows protected your PC") the first time you run it — expected for an unsigned free hobby project, not a sign of a problem. Click **"More info"** → **"Run anyway"**. Only appears once per machine.

Prefer to run from source instead (for development, or if you don't trust an unsigned `.exe`)? See **Quick Start** below.

---

## Quick Start (running from source)

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

Both are equally reachable as plain `http://localhost:5173` / `:3001` — `steamstats.localhost` is just the friendlier name the app itself uses (auto-opened by the packaged `.exe`, printed by the server on startup). See [Why `steamstats.localhost`?](#why-steamstatslocalhost) below if you're curious how that works without any setup.

---

### Why `steamstats.localhost`?

Every hostname ending in `.localhost` is reserved by [RFC 6761](https://datatracker.ietf.org/doc/html/rfc6761) to always mean "this machine," and every modern browser (Chrome, Edge, Firefox) resolves it straight to loopback for free — no hosts file edit, no admin rights, no per-machine setup step. That made it the right fit for a friendlier URL than `localhost:3001`, over the two more obvious-looking options:

- **`.dev`** is a real, Google-owned public TLD that's on the browser [HSTS preload list](https://hstspreload.org/) — the entire TLD is forced to HTTPS. A plain `http://` address on `.dev` doesn't just look wrong, it fails outright with no working certificate to serve.
- **`.local`** is reserved for mDNS/Bonjour service discovery, not general-purpose hostnames — it can resolve unpredictably (or not at all) depending on what's running on the network, and would still need a hosts file edit to mean anything here.

`.localhost` needed neither. `steamstats.localhost:3001` and `steamstats.localhost:5173` work today, for every user, with zero setup — that's why the server prints them and the packaged `.exe` opens them automatically.

---

### Running tests

Algorithm logic (streaks, percentiles, snapshot-derived series) has a [Vitest](https://vitest.dev) suite in `src/utils/steam.test.js`:
```
npm test
```

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
- This is separate from the Dashboard's Play Streak / Personal Percentile, which do need a few days of local snapshot history to build up (see below)

---

## Settings

Click your **profile name** in the top-right corner to open Settings:

- **Steam Connection** — change API key or profile URL
- **Local Steam Path** — detected path, library folders, and a manual override if auto-detection misses your install
- **HowLongToBeat** — integration status and a test lookup
- **Display** — light/dark mode, plus **Feature Flags** for the experimental 7-Day and 30-Day dashboard periods (these use local snapshot data, so accuracy improves the longer you've had the app running — they're opt-in rather than on by default for that reason)
- **Data & Cache** — data folder location, snapshot count, clear snapshots, or reset the app entirely
- **Debug Info** — copy status info when reporting issues

---

## Where your data lives

Everything the app persists — your app config (API key, Steam ID, theme), snapshot
history, and the genre/rarity/HowLongToBeat caches — is kept in one folder outside
the app's install directory:

- Windows: `%APPDATA%\SteamStats`
- macOS: `~/Library/Application Support/SteamStats`
- Linux: `$XDG_DATA_HOME/SteamStats` or `~/.local/share/SteamStats`

Because it lives outside the release folder, it's untouched when you update to a
new release — just unzip the new version and keep using it. **Settings → Data &
Cache → Open Folder** takes you straight there.

App config and snapshot history are also mirrored into your browser's
`localStorage` for fast reads; the data folder is the durable copy that survives
both app updates and a cleared browser profile.

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
2. Compiles `bootstrap.cjs` into `Steam Stats.exe` via pkg
3. Downloads a standalone `node.exe` to bundle alongside it (needed so the packaged app doesn't try to relaunch itself — only happens once, cached afterward)
4. Copies `server.js` and the built frontend alongside it
5. Installs a minimal, server-only `node_modules` — just `express`, `cors`, `helmet`, and `axios`, not the full frontend dev dependency tree
6. Writes the launcher and a `README.txt` for whoever you send it to

Output lands in `release/`. Zip that whole folder — that's the distributable.

**Running it:** double-click **`Start Steam Stats.bat`** — a console window shows startup logs, and a browser tab opens automatically once the server is ready. Close the console window to stop the app.

**Windows will show a SmartScreen warning ("Windows protected your PC")** the first time anyone runs `Steam Stats.exe` — this is expected and not a sign of a problem. The executable isn't code-signed (a signing certificate costs money and this is a free hobby project), so Windows doesn't yet recognize it as coming from a known publisher. To run it anyway: click **"More info"**, then **"Run anyway"**. This is the same warning any small unsigned indie tool shows on first run; it only appears once per machine.

**Why not a single file?** pkg's executable alone can't reliably include `node_modules` (native bindings, dynamic requires, and file-size bloat make that fragile). Shipping `server.js` + `dist/` + a minimal `node_modules` alongside a small bootstrap `.exe` is the standard, reliable pattern — the folder is still just one download, one zip, one double-click for whoever you send it to.

**First build note:** the very first time you run `build:release`, pkg downloads a prebuilt Node.js binary (~40–80MB) to embed in the executable, and the script separately downloads a standalone `node.exe` for the release folder. Both need normal internet access and only happen once — pkg's download is cached in `~/.pkg-cache` afterward.

---

## Troubleshooting

**"Cannot GET /"** on port 3001 — this is normal, that's the API server. Open port 5173 instead.

**`steamstats.localhost` won't load** — this shouldn't happen on any current browser, but if it does, plain `http://localhost:5173` (dev) or `http://localhost:3001` (packaged app) opens the identical app.

**"Steam rejected this API key"** — the key is wrong, or (if you just generated it) hasn't finished activating yet; give it a minute and retry. Double-check it at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey).

**"No Steam profile found for ..."** — the profile URL or ID doesn't resolve to an account. This is almost always a typo or a copy-paste issue, not a privacy setting — try your full profile URL instead of a vanity name.

**"Steam connected, but your library came back empty"** — this means **Game details** is still Private. That's a separate toggle from overall profile visibility: **Profile → Edit Profile → Privacy Settings → Game details → Public** (see Quick Start step 4), then hit Retry.

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

---

## A note on HowLongToBeat

HowLongToBeat doesn't offer a public API, so this app talks to an internal endpoint their own website uses — the same approach any unofficial HLTB integration takes. It's unofficial, best-effort, and can break if HLTB changes their site; when it does, completion-time estimates just won't show up rather than the app failing. There's a manual token override in **Settings → HowLongToBeat** as a fallback if auto-detection stops working.

---

## License

[MIT](LICENSE) — free to use, modify, and distribute. See [CHANGELOG.md](CHANGELOG.md) for release history, and the release folder's `THIRD_PARTY_LICENSES.txt` for the open-source packages it bundles.
