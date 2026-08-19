// ─────────────────────────────────────────────
// electron/main.js — the app's entry point.
//
// This replaces the old bootstrap.cjs + pkg + bundled node.exe arrangement.
// That setup shipped the Node runtime TWICE (a 75MB pkg executable whose only
// job was to spawn an 83MB node.exe), because pkg's bytecode VM couldn't run
// server.js directly — see the three documented attempts in the old
// bootstrap.cjs. Electron's main process *is* Node, so the whole problem
// disappears: server.js is imported here and runs in-process.
//
// The architecture is otherwise deliberately unchanged. server.js still binds
// an Express server to 127.0.0.1:3001 and this window loads it over HTTP,
// rather than being rewritten to talk over Electron IPC. That keeps 1229 lines
// of battle-tested Steam proxying, HLTB scraping and VDF parsing exactly as
// they are, and it means the app is still reachable in a normal browser (and
// still installable as a PWA) for anyone who prefers that.
// ─────────────────────────────────────────────

import { app, BrowserWindow, shell, dialog } from 'electron';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const PORT = 3001;
const isDev = process.argv.includes('--dev');

// The window is a Chromium navigation, so it gets the friendly hostname per
// the project's .localhost convention. The health poll below deliberately
// uses plain "localhost" — that's a Node-to-Node request, and *.localhost
// resolving to loopback is a browser convention Node's resolver doesn't
// guarantee. Same split as the old bootstrap.cjs made.
const APP_URL = `http://steamstats.localhost:${PORT}`;
const DEV_URL = 'http://localhost:5173';
const HEALTH_URL = `http://localhost:${PORT}/api/health`;

let mainWindow = null;

// Two instances would both try to bind port 3001 and the second would fail
// with EADDRINUSE, leaving a dead window. Focus the existing one instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

/** Poll the server's own health endpoint until it answers. */
function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(HEALTH_URL, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error(`Server did not respond on port ${PORT} within ${timeoutMs / 1000}s`));
        } else {
          setTimeout(attempt, 250);
        }
      });
      req.setTimeout(1000, () => req.destroy());
    };
    attempt();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    // Matches the manifest's background_color and the dark theme's base, so
    // there's no white flash before the app paints.
    backgroundColor: '#06080c',
    // Don't show an empty frame while the renderer boots.
    show: false,
    title: 'Steam Stats',
    // Hidden until Alt is pressed. Keeps the default menu's View → Toggle
    // DevTools (Ctrl+Shift+I) available, which is what made the old console
    // window worth keeping — the debuggable path survives the migration.
    autoHideMenuBar: true,
    webPreferences: {
      // The renderer is an ordinary web page talking to localhost over HTTP.
      // It has no need for Node, so it doesn't get it.
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // Without this, a failed load is an indistinguishable blank window. Since
  // the app has exactly one window, a silent failure here is total.
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`❌ Window failed to load ${url} — ${description} (${code})`);
  });

  // The UI links out to the Steam store and to Steam's API-key page. Those
  // must open in the user's real browser — the API-key page is a logged-in
  // Steam flow, and handling it in an app window would both look wrong and
  // strand the user in a frame with no address bar or password manager.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Same protection for in-page navigations (a plain <a href> without
  // target="_blank"), which the handler above doesn't cover.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL) && !url.startsWith(DEV_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.loadURL(isDev ? DEV_URL : APP_URL);
}

app.whenReady().then(async () => {
  // server.js reads this to locate the built frontend. It normally looks for
  // dist/ next to itself, which is still correct here, but passing it
  // explicitly means the packaged layout can move without editing server.js.
  process.env.STEAM_STATS_DIST = path.join(ROOT, 'dist');

  try {
    // Importing server.js starts it — it calls app.listen() at module scope.
    await import('../server.js');
    await waitForServer();
  } catch (err) {
    dialog.showErrorBox(
      'Steam Stats could not start',
      `The local server failed to start.\n\n${err?.message || err}\n\n` +
      `Most often this means port ${PORT} is already in use — check for an ` +
      `older copy of Steam Stats still running and close it, then try again.`
    );
    app.quit();
    return;
  }

  createWindow();

  // macOS convention: clicking the dock icon with no windows open reopens one.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On Windows and Linux, closing the window means quitting — there's no
  // menu-bar-only mode for this app to sit in.
  if (process.platform !== 'darwin') app.quit();
});
