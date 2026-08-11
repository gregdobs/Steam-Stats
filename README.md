# 🎮 SteamStats

A personal gaming analytics dashboard powered by Steam's API and your local Steam installation.

---

## Starting the App

You need two PowerShell (or Command Prompt) windows open at the same time.

**Window 1 — API Server:**
```
cd C:\Users\gregd\Downloads\steam-dashboard
node server.js
```

You should see:
```
🎮 Steam Dashboard Server running on http://localhost:3001
✅ Steam installation found: F:\Games\Steam
```

**Window 2 — UI:**
```
cd C:\Users\gregd\Downloads\steam-dashboard
npx vite --port 5173
```

You should see:
```
  VITE v5.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

**Then open your browser to:**
```
http://localhost:5173
```

---

## Stopping the App

In each terminal window, press **Ctrl + C** to stop the server.

---

## Accessing the App

The app only runs while both terminal windows are open. If you close a terminal, that server stops.

| URL | What it is |
|---|---|
| http://localhost:5173 | The dashboard (open this in your browser) |
| http://localhost:3001 | API server (you never need to open this) |

---

## First-Time Setup

### 1. Install Node.js
Download from [nodejs.org](https://nodejs.org) — LTS version. Run the installer (Next → Next → Finish).

### 2. Install dependencies (one time only)
```
cd C:\Users\gregd\Downloads\steam-dashboard
npm install
```

### 3. Get a Steam API Key
Go to [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) and register a key. Use `localhost` as the domain name.

### 4. Set your Steam profile to Public
In Steam: **Profile → Edit Profile → Privacy Settings → Game details → Public**

### 5. Enter your details in the app
On first load, enter your API key and Steam profile URL:
```
https://steamcommunity.com/profiles/76561198044492736
```

---

## Features

### ⊞ Dashboard
- Hero card for your most-played game with full artwork
- Interactive time breakdown donut — click segments to see game details
- Game grid with period vs. all-time comparison
- Toggle between **Last 2 Weeks** and **All Time**

### 📚 Library
- Playtime distribution donut — click a bucket to filter the game table
- Top 15 bar chart — click a bar to highlight in the table
- Launch frequency vs. hours scatter plot — click a dot to filter
- Full sortable game table with inline filter pills

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
- Gets richer every day you open the app

---

## Settings

Click your **profile name** in the top-right corner to open Settings:

- **Steam Connection** — change API key or profile URL
- **Local Steam Path** — see detected path and library folders
- **HowLongToBeat** — check integration status and run a test lookup
- **Display** — light/dark mode
- **Data & Cache** — clear snapshots or reset the app
- **Debug Info** — copy status info when reporting issues

---

## Local Steam Data

The server automatically reads from `F:\Games\Steam` and merges local data into the dashboard:

| Data | What it unlocks |
|---|---|
| Launch count per game | "Launched 47×" stat, scatter plot |
| Last played timestamps | More accurate than Steam API |
| Your custom tags | Shown on game cards |

---

## Building a Distributable .exe

Package the whole app into a folder anyone can run by double-clicking, with no Node.js install required on their end.

**One-time setup (already done if you cloned this repo):**
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
3. Copies `server.js` and the built frontend alongside it
4. Installs a minimal, server-only `node_modules` (not the full dev dependency tree — just `express`, `cors`, `axios`, `open`)
5. Writes a `Start SteamStats.bat` launcher and a `README.txt`

Output lands in `release/`. That entire folder is the distributable — zip it and send it to anyone. They unzip, double-click `Start SteamStats.bat`, and their browser opens automatically.

**Why not a single file?** pkg's executable alone can't include `node_modules` reliably (native bindings, dynamic requires, and file-size bloat make that fragile). Shipping `server.js` + `dist/` + a minimal `node_modules` alongside a small bootstrap `.exe` is the standard, reliable pattern — the folder is still just one download, one zip, one double-click for the end user.

**First build note:** the very first time you run `build:release`, pkg downloads a prebuilt Node.js binary (~40-80MB) from GitHub releases to embed in the executable. This requires normal internet access and only happens once — it's cached in `~/.pkg-cache` afterward.



**"Cannot GET /"** on port 3001 — this is normal. Open port 5173 instead.

**"Profile not found"** — set your Steam Game Details privacy to Public.

**HowLongToBeat shows no data** — HLTB occasionally blocks automated requests. Try:
1. Open [howlongtobeat.com](https://howlongtobeat.com) in your browser first
2. Restart both servers (Ctrl+C, then run again)
3. Check Settings → HowLongToBeat → Test button for details

**Port already in use** — another process is using 5173 or 3001. Stop it with:
```
npx kill-port 5173
npx kill-port 3001
```

**Steam not found** — go to Settings → Local Steam Path for diagnostics.
