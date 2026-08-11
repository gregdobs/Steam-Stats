// ─────────────────────────────────────────────
// tray-runner.cjs
//
// Runs as a genuine child process spawned by bootstrap.cjs using the real
// bundled node.exe — NOT compiled by pkg, so it has zero VM restrictions
// (no ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING risk, full CJS/ESM interop).
//
// Responsibilities:
//   1. Start server.js as its own child process
//   2. Show a system tray icon with Open Dashboard / Quit
//   3. Guarantee the server child is killed on every exit path — process
//      exit, tray Quit click, Ctrl+C, or an unexpected crash — so nothing
//      is ever left orphaned holding port 3001.
//
// If the tray icon fails to initialize for any reason (missing display,
// unsupported platform, binary permission issue, etc.) this script falls
// back to just running the server with a visible console, so a tray
// failure never breaks the app itself — it only loses the "hidden window"
// convenience.
// ─────────────────────────────────────────────

const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const http = require('http');

// This script's own directory IS the app dir — bootstrap.cjs always spawns
// it with cwd explicitly set to appDir, so __dirname is reliable here.
const APP_DIR = __dirname;
const SERVER_PATH = path.join(APP_DIR, 'server.js');
const NODE_EXE = process.execPath; // the real node.exe that's running this file

let serverChild = null;
let trayAvailable = false;

function log(msg) {
  console.log(msg);
}

function killServerChild() {
  if (!serverChild || serverChild.killed || serverChild.exitCode !== null) return;

  try {
    if (process.platform === 'win32') {
      // Tree-kill on Windows — a plain .kill() can leave grandchild
      // processes (if any) orphaned; taskkill /T kills the whole tree.
      execFile('taskkill', ['/PID', String(serverChild.pid), '/T', '/F'], () => {});
    } else {
      // Verified via isolated testing: relaying SIGTERM through
      // child.kill() correctly reaches the child process and its own
      // handler fires as expected. (An earlier test run appeared to show
      // this failing, but that was traced to a stale/deleted test file
      // from cleanup between steps, not a real defect — re-verified clean.)
      serverChild.kill('SIGTERM');
    }
  } catch (err) {
    // Process may have already exited on its own — not worth surfacing.
  }
}

// Ensure cleanup on every possible exit path
process.on('exit', killServerChild);
process.on('SIGINT', () => { killServerChild(); process.exit(0); });
process.on('SIGTERM', () => { killServerChild(); process.exit(0); });
process.on('uncaughtException', (err) => {
  console.error('Tray runner crashed:', err);
  killServerChild();
  process.exit(1);
});

function startServer() {
  serverChild = spawn(NODE_EXE, [SERVER_PATH], {
    cwd: APP_DIR,
    stdio: 'inherit',
    windowsHide: true,
  });
  serverChild.on('error', (err) => {
    console.error('Failed to start server:', err.message);
  });
  serverChild.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Server exited unexpectedly with code ${code}`);
    }
  });
}

function waitForServerReady(callback, attemptsLeft = 50) {
  const req = http.get('http://localhost:3001/api/health', (res) => {
    res.resume();
    callback();
  });
  req.on('error', () => {
    if (attemptsLeft <= 0) return;
    setTimeout(() => waitForServerReady(callback, attemptsLeft - 1), 300);
  });
  req.setTimeout(1000, () => req.destroy());
}

function openBrowser() {
  const url = 'http://localhost:3001';
  try {
    if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', url], () => {});
    else if (process.platform === 'darwin') execFile('open', [url], () => {});
    else execFile('xdg-open', [url], () => {});
  } catch {}
}

// A minimal embedded icon (16x16 transparent-background PNG, base64) so we
// don't depend on shipping a separate .ico/.png asset file. Good enough for
// a functional tray icon; can be swapped for a real branded icon later.
const TRAY_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAqUlEQVR4Ae3XsQ2AMAxE0Q' +
  'zAJIzAJIzACGzAADACjMAmoUCUUcSXwlfk3v9NGtutJKmA3AzYgZM3FQPqAZwmJcVsQGYA' +
  '7ADuk2LhrUFmAOwA9pOi4a1BZgDsAPaTouGtQWYA7AD2k6LhrUFmAOwA9pOi4a1BZgDsAP' +
  'aTouGtQWYA7AD2k6LhrUFmAOwA9pOi4a1BZgDsAPaTouGtQWYA7AD2k6LhrUFmAOwA9pOi' +
  '4a1BZgDsAPaTouGtQWYAAAAASUVORK5CYII=';

function tryStartTray() {
  let SysTray;
  try {
    const pkg = require('systray2');
    SysTray = pkg.default || pkg;
  } catch (err) {
    log(`⚠️  systray2 not available (${err.message}) — running without tray icon`);
    return false;
  }

  const itemOpen = { title: 'Open SteamStats', tooltip: 'Open in browser', checked: false, enabled: true };
  const itemQuit = { title: 'Quit', tooltip: 'Stop SteamStats', checked: false, enabled: true };

  let systray;
  try {
    systray = new SysTray({
      menu: {
        icon: TRAY_ICON_BASE64,
        title: 'SteamStats',
        tooltip: 'SteamStats — click to open',
        items: [itemOpen, itemQuit],
      },
      debug: false,
      copyDir: false,
    });
  } catch (err) {
    log(`⚠️  Failed to create tray icon (${err.message}) — running without it`);
    return false;
  }

  systray.onClick((action) => {
    if (action.item.title === 'Open SteamStats') {
      openBrowser();
    } else if (action.item.title === 'Quit') {
      killServerChild();
      systray.kill(false);
      process.exit(0);
    }
  });

  // Guard against systray2's ready() promise hanging indefinitely on
  // unsupported/headless environments (confirmed during testing: with no
  // display server available, the promise neither resolves nor rejects —
  // it just hangs silently). A hard timeout means the app always reports
  // its actual state instead of appearing to freeze.
  let settled = false;
  const TRAY_INIT_TIMEOUT_MS = 5000;

  systray.ready()
    .then(() => {
      if (settled) return;
      settled = true;
      log('✅ Tray icon ready — right-click it for Open/Quit');
    })
    .catch((err) => {
      if (settled) return;
      settled = true;
      log(`⚠️  Tray icon failed to start: ${err.message}`);
    });

  setTimeout(() => {
    if (settled) return;
    settled = true;
    log('⚠️  Tray icon did not respond in time — continuing without it. The app still works; use the debug .bat launcher if you want a visible console.');
  }, TRAY_INIT_TIMEOUT_MS);

  return true;
}

function main() {
  log('🎮 SteamStats starting…');
  log(`Working directory: ${APP_DIR}`);

  if (!fs.existsSync(SERVER_PATH)) {
    console.error(`❌ Cannot find server.js in ${APP_DIR}`);
    process.exit(1);
  }

  startServer();

  waitForServerReady(() => {
    log('✅ Server ready — opening browser...');
    openBrowser();
  });

  trayAvailable = tryStartTray();
  if (!trayAvailable) {
    log('ℹ️  Close this window to stop SteamStats.');
  }
}

main();
