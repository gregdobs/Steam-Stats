// ─────────────────────────────────────────────
// bootstrap.cjs — pkg entry point
//
// WHY THIS FILE EXISTS AND WHY IT'S SHAPED THIS WAY:
//
// Attempt 1 (import() inside compiled bootstrap): failed with
// ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING — pkg's compiled bytecode VM
// disallows dynamic import(), confirmed via direct testing.
//
// Attempt 2 (spawn(process.execPath, [serverPath])): failed by recursively
// re-launching the packaged .exe itself instead of running server.js —
// process.execPath inside a pkg binary IS the .exe, and pkg's documented
// PKG_EXECPATH='' override did not prevent the recursion in practice
// (confirmed via testing: infinite "Steam Stats starting..." loop).
//
// Attempt 3 (this one): spawn a REAL, separate node.exe binary that ships
// alongside the release folder (build-release.js downloads it from
// nodejs.org). No ambiguity, no pkg-specific recursion tricks — just a
// genuine Node.js executable running server.js as a normal child process
// with full unrestricted ESM support.
// ─────────────────────────────────────────────

const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const http = require('http');

const isPackaged = !!process.pkg;
const appDir = isPackaged
  ? path.dirname(process.execPath)
  : __dirname;

const serverPath = path.join(appDir, 'server.js');
const nodeModulesPath = path.join(appDir, 'node_modules');
const bundledNodePath = path.join(appDir, 'node.exe');

function waitForExit(message) {
  console.log(`\n${message}\n`);
  console.log('Press Enter to exit…');
  try {
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on('data', () => process.exit(1));
  } catch {
    process.exit(1);
  }
}

function fail(message) {
  waitForExit(
    `❌ ${message}\n\n` +
    'This app expects the following alongside the .exe:\n' +
    '  server.js\n' +
    '  dist/          (built frontend)\n' +
    '  node_modules/  (run "npm install --production" if missing)\n' +
    '  node.exe       (bundled Node.js runtime)'
  );
}

// Poll localhost:3001 until the server responds, then open the browser.
function waitForServerReady(callback, attemptsLeft = 50) {
  const req = http.get('http://localhost:3001/api/health', (res) => {
    res.resume();
    callback();
  });
  req.on('error', () => {
    if (attemptsLeft <= 0) {
      console.log('\n⚠️  Server did not respond in time. It may still be starting —');
      console.log('    try opening http://localhost:3001 manually in a moment.');
      return;
    }
    setTimeout(() => waitForServerReady(callback, attemptsLeft - 1), 300);
  });
  req.setTimeout(1000, () => req.destroy());
}

function openBrowser() {
  const url = 'http://localhost:3001';
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      execFile('cmd', ['/c', 'start', '', url], () => {});
    } else if (platform === 'darwin') {
      execFile('open', [url], () => {});
    } else {
      execFile('xdg-open', [url], () => {});
    }
  } catch {
    console.log(`\n⚠️  Could not auto-open browser. Visit ${url} manually.`);
  }
}

function main() {
  console.log('🎮 Steam Stats starting…\n');
  console.log(`Working directory: ${appDir}`);

  if (!fs.existsSync(serverPath)) {
    return fail(`Cannot find server.js next to the executable (looked in ${appDir})`);
  }
  if (!fs.existsSync(nodeModulesPath)) {
    return fail(`Cannot find node_modules next to the executable (looked in ${appDir})`);
  }

  // When unpackaged (dev mode), use whatever Node is already running this
  // script. When packaged, use the real, separate node.exe shipped
  // alongside the release — never process.execPath, which inside a pkg
  // binary points at the .exe itself and would recurse.
  const nodeExe = isPackaged ? bundledNodePath : process.execPath;

  if (isPackaged && !fs.existsSync(nodeExe)) {
    return fail(`Cannot find node.exe next to the executable (looked in ${appDir})`);
  }

  const child = spawn(nodeExe, [serverPath], {
    cwd: appDir,
    stdio: 'inherit',
    windowsHide: false,
  });

  child.on('error', (err) => {
    fail(`Failed to start server process: ${err.message}`);
  });

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      waitForExit(`Server exited with code ${code}.`);
    }
  });

  waitForServerReady(() => {
    console.log('\n✅ Server ready — opening browser...');
    openBrowser();
  });

  process.on('SIGINT', () => { child.kill(); process.exit(0); });
}

main();
