# Everything from this session — one drop-in

11 files, repo-relative paths preserved. Unzip at your repo root to
overwrite/add all of them at once.

| File | What changed |
|---|---|
| `package.json` | Dead deps removed (`howlongtobeat-core`, `vdf-parser`, `open`) + `description`/`engines`/`license` added |
| `package-lock.json` | Regenerated clean against the trimmed `package.json` |
| `build-release.js` | Dropped `open` from bundled release deps |
| `index.html` | Tab title `Steam Dashboard` → `SteamStats` |
| `.gitignore` | Added Claude Code local-settings, `.env`, delivery-zip ignores |
| `README.md` | Corrected startup instructions, documented Backlog + new Dashboard features, fixed Local Steam Data path list, fixed distributable-build section |
| `src/hooks/useAppContext.jsx` | Fixed `getAchievementsForGames` closure-staleness bug |
| `src/utils/steam.js` | §5 rebuild: Personal Percentile, Play Streak w/ Forgiveness, Tonight recommender |
| `src/components/StreakAndPercentile.jsx` | New |
| `src/components/TonightPick.jsx` | New |
| `src/pages/Dashboard.jsx` | Wired in both new components |

## Still needs manual deletion (a drop-in zip can't delete files)

```
git rm src/App.css src/assets/vite.svg src/assets/react.svg
```

All three confirmed unused — see the earlier hygiene-pass notes for detail
if you want the full reasoning.

## After dropping in

```
npm install
npm run dev
```

`npm install` picks up the new lockfile cleanly since it's already
regenerated — this isn't strictly required but confirms everything
resolves on your machine before you push.
