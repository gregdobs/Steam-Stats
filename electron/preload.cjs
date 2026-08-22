// The renderer's only channel to the shell, and deliberately the narrowest
// one that does the job: it reports which theme the app is showing so the
// main process can match the native window frame to it.
//
// CommonJS (.cjs) on purpose — the project is "type": "module", but preload
// scripts run in a sandboxed context that loads CJS, so an .js file here
// would be parsed as ESM and fail.
//
// This does NOT open a general IPC surface. The Express server stays the way
// the app talks to its backend (see CLAUDE.md) so the whole thing still runs
// in a plain browser; there, `window.steamStatsShell` is simply undefined and
// every call site no-ops.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('steamStatsShell', {
  setFrameTheme: (theme) => ipcRenderer.send('steam-stats:frame-theme', theme),
});
