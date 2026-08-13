# Branding patches — 6 files not included as full rewrites

For these 6 files, I only have partial/fragmented views from project search
in this session — not a verified complete copy. Rewriting them in full
would risk silently dropping code I haven't seen. Instead: every one of
these is a simple, safe global find-and-replace.

## Do this (safest option)

In each file below, do a **case-sensitive find-and-replace**:
`SteamStats` → `Steam Stats`

That's it for 5 of the 6 files — the literal string `SteamStats` only ever
appears as the brand name in this codebase (confirmed no variable names,
CSS classes, or localStorage keys use that substring), so a blind
replace-all is safe.

**`server.js` needs one additional, different replacement** (not
`SteamStats` — this one predates that name entirely):
`Steam Dashboard Server running` → `Steam Stats Server running`

## Where each occurrence is, if you want to verify as you go

**`src/components/Navbar.jsx`** — 1 occurrence, the nav logo:
```jsx
Steam<span style={{ color: 'var(--accent-blue)' }}>Stats</span>
```
→ add a space so it reads "Steam Stats":
```jsx
Steam <span style={{ color: 'var(--accent-blue)' }}>Stats</span>
```
(This one needs the space added manually — a literal find-replace of
`SteamStats` won't catch it, since the actual text is split across a JSX
tag: `Steam` then `<span>Stats</span>` with no literal `SteamStats`
substring to match.)

**`src/components/SetupScreen.jsx`** — same pattern, same fix, in the
first-run logo heading:
```jsx
Steam<span style={{ color: 'var(--accent-blue)' }}>Stats</span>
```
→
```jsx
Steam <span style={{ color: 'var(--accent-blue)' }}>Stats</span>
```

**`src/components/ShareCard.jsx`** — 2 occurrences:
1. Canvas-drawn header text on the downloadable share card:
   `ctx.fillText('🎮 SteamStats', 60, 80);` → `ctx.fillText('🎮 Steam Stats', 60, 80);`
2. Downloaded filename — this one I'd suggest kebab-casing rather than
   literally inserting a space (spaces in auto-downloaded filenames are legal
   but non-standard):
   `` `steamstats-${period}-${Date.now()}.png` `` → `` `steam-stats-${period}-${Date.now()}.png` ``

**`tray-runner.cjs`** — several occurrences, all straightforward:
- Tray menu item: `title: 'Open SteamStats'` → `title: 'Open Steam Stats'`
- Tray tooltip: `tooltip: 'Stop SteamStats'` → `tooltip: 'Stop Steam Stats'`
- Tray window title: `title: 'SteamStats'` → `title: 'Steam Stats'`
- Tray tooltip: `tooltip: 'SteamStats — click to open'` → `tooltip: 'Steam Stats — click to open'`
- Click handler check: `action.item.title === 'Open SteamStats'` → `action.item.title === 'Open Steam Stats'`
- Startup log: `log('🎮 SteamStats starting…');` → `log('🎮 Steam Stats starting…');`
- Fallback log: `'Close this window to stop SteamStats.'` → `'Close this window to stop Steam Stats.'`

**`bootstrap.cjs`** — 1 occurrence:
`console.log('🎮 SteamStats starting…\n');` → `console.log('🎮 Steam Stats starting…\n');`

**`server.js`** — 1 occurrence (the one that's NOT a `SteamStats` match, see above):
`` `\n🎮 Steam Dashboard Server running on http://localhost:${PORT}` `` → `` `\n🎮 Steam Stats Server running on http://localhost:${PORT}` ``

## Why I split it this way

`App.jsx`, `README.md`, `package.json`, `build-release.js`, `index.html`,
and the new `favicon.svg` are in the main zip as full files — I have
complete, verified copies of those from this session. The 6 above are
existing files I've only ever seen in fragments via search, so a full
rewrite risks reproducing them incompletely. A find-and-replace is zero-risk
by comparison — it touches only the exact matched text and leaves
everything else in the file exactly as it already is.

If you'd rather not do this by hand, paste me the current contents of any
of these 6 files and I'll return the exact patched version.
