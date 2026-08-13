#!/usr/bin/env node
// ─────────────────────────────────────────────
// build-release.js
// Assembles a complete, double-click-ready Windows distribution:
//   release/
//     Steam Stats.exe
//     server.js
//     dist/            (built frontend)
//     node_modules/     (production deps only, pruned)
//     Start Steam Stats.vbs
//     Start Steam Stats (debug).bat
//     README.txt
//
// Run with: node build-release.js
// ─────────────────────────────────────────────

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RELEASE_DIR = path.join(__dirname, 'release');

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: __dirname, ...opts });
}

function copyRecursive(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

console.log('🎮 Building Steam Stats Windows release...\n');

// 1. Clean previous release
if (fs.existsSync(RELEASE_DIR)) {
  console.log('Cleaning previous release folder...');
  fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
}
fs.mkdirSync(RELEASE_DIR, { recursive: true });

// 2. Build the frontend
run('npm run build');

// 3. Compile the pkg executable
// Quoted — the output path now contains a space ("Steam Stats.exe"), and
// this string goes through a shell via execSync, so it needs quoting or
// pkg would see "release/Steam" and "Stats.exe" as two separate arguments.
run('npx @yao-pkg/pkg . --target node22-win-x64 --output "release/Steam Stats.exe"');

// 3b. Download a real, standalone node.exe to bundle alongside the release.
//     bootstrap.cjs spawns THIS binary to run server.js — NOT
//     process.execPath, which inside a packaged pkg .exe points back at
//     itself and would cause infinite recursion (confirmed via testing).
const NODE_VERSION = '22.23.1'; // keep in sync with pkg target above
const nodeExeUrl = `https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`;
const nodeExeDest = path.join(RELEASE_DIR, 'node.exe');

console.log(`\nDownloading Node.js runtime (v${NODE_VERSION}) for the release...`);
console.log(`  ${nodeExeUrl}`);
try {
  run(`curl -L -o "${nodeExeDest}" "${nodeExeUrl}"`);
  const sizeMB = (fs.statSync(nodeExeDest).size / 1024 / 1024).toFixed(1);
  console.log(`✅ node.exe downloaded (${sizeMB} MB)`);
} catch (err) {
  console.error('\n❌ Failed to download node.exe automatically.');
  console.error(`   Manually download it from ${nodeExeUrl}`);
  console.error(`   and place it at ${nodeExeDest}\n`);
  process.exit(1);
}

// 4. Copy server.js
console.log('\nCopying server.js...');
fs.copyFileSync(path.join(__dirname, 'server.js'), path.join(RELEASE_DIR, 'server.js'));

// 5. Copy built frontend
console.log('Copying dist/...');
copyRecursive(path.join(__dirname, 'dist'), path.join(RELEASE_DIR, 'dist'));

// 6. Install production-only node_modules directly into release folder
//    Only server.js's + tray-runner.cjs's actual runtime imports belong
//    here — NOT the full dependency list from the main package.json, which
//    includes frontend build-time packages (react, chart.js, vite, etc.)
//    the server never touches at runtime. Keeping this minimal keeps the
//    release small.
console.log('\nInstalling production dependencies into release folder...');
const mainPkgJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const SERVER_RUNTIME_DEPS = ['express', 'cors', 'helmet', 'axios', 'systray2'];
const releaseDeps = {};
for (const dep of SERVER_RUNTIME_DEPS) {
  if (mainPkgJson.dependencies[dep]) {
    releaseDeps[dep] = mainPkgJson.dependencies[dep];
  } else {
    console.warn(`⚠️  Expected runtime dep "${dep}" not found in package.json dependencies`);
  }
}
const releasePkgJson = {
  name: 'steam-dashboard',
  private: true,
  version: mainPkgJson.version,
  type: 'module',
  dependencies: releaseDeps,
};
fs.writeFileSync(path.join(RELEASE_DIR, 'package.json'), JSON.stringify(releasePkgJson, null, 2));
run('npm install --omit=dev --no-audit --no-fund', { cwd: RELEASE_DIR });

// 6b. Copy tray-runner.cjs — the child process that owns the tray icon,
//     the server child, and cleanup. bootstrap.cjs prefers this if present
//     and falls back to running server.js directly (visible console) if not.
console.log('\nCopying tray-runner.cjs...');
fs.copyFileSync(path.join(__dirname, 'tray-runner.cjs'), path.join(RELEASE_DIR, 'tray-runner.cjs'));

// 7. Write launchers.
//    PRIMARY: a .vbs wrapper that launches Steam Stats.exe with a hidden
//    window — this is the actual "no visible console" entry point, since
//    pkg's compiled .exe is a console-subsystem binary that always flashes
//    a window when double-clicked directly, and setting windowsHide on a
//    spawned CHILD doesn't hide the PARENT's own console.
//    FALLBACK: a visible-console troubleshooting option — if the hidden
//    version misbehaves, this shows exactly what's happening, which
//    matters given how much trial-and-error this bundling approach has
//    already needed.
console.log('\nWriting launcher scripts...');

fs.writeFileSync(path.join(RELEASE_DIR, 'Start Steam Stats.vbs'), `' Steam Stats silent launcher — runs Steam Stats.exe with no visible console window.
' Use "Start Steam Stats (debug).bat" instead if you need to see startup logs
' or something isn't working.
Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
objShell.Run """Steam Stats.exe""", 0, False
`);

fs.writeFileSync(path.join(RELEASE_DIR, 'Start Steam Stats (debug).bat'), `@echo off
title Steam Stats (debug mode)
cd /d "%~dp0"
echo Starting Steam Stats in debug mode...
echo This window shows startup logs and stays open so you can see errors.
echo A browser window will open automatically once the server is ready.
echo.
"Steam Stats.exe"
pause
`);

// 8. Write a short README for the release folder
fs.writeFileSync(path.join(RELEASE_DIR, 'README.txt'), `Steam Stats
===========

HOW TO RUN:
1. Double-click "Start Steam Stats.vbs" — no window will appear, but a
   tray icon shows up near your clock. Your browser opens automatically.
2. Right-click the tray icon for "Open Steam Stats" or "Quit".

TROUBLESHOOTING:
If the .vbs launcher doesn't seem to do anything, or you want to see what's
happening during startup, use "Start Steam Stats (debug).bat" instead — it
keeps a console window open showing logs and any error messages.

FIRST-TIME SETUP:
- You'll need a free Steam Web API key from:
  https://steamcommunity.com/dev/apikey
- Your Steam profile must be set to Public
  (Steam > Profile > Edit Profile > Privacy Settings)

STOPPING THE APP:
- Right-click the tray icon near your clock and choose "Quit"
- Or, if using the debug .bat launcher, just close its console window

If HowLongToBeat data isn't loading, check Settings > HowLongToBeat inside
the app for diagnostics. Local Steam data (launch counts, session insights)
requires the app to find your Steam installation automatically, or you can
set a custom path in Settings > Local Steam Path.

This folder is self-contained — you can move it anywhere, but keep all the
files together (don't move Steam Stats.exe out on its own). It includes its
own Node.js runtime (node.exe), so nothing else needs to be installed on
this computer.
`);

console.log('\n✅ Release built successfully!');
console.log(`📦 Distributable folder: ${RELEASE_DIR}`);
console.log('\nTo distribute: zip the entire "release" folder and share it.');
console.log('Users unzip it and double-click "Start Steam Stats.vbs" — no console window,');
console.log('a tray icon appears near the clock with Open/Quit options.');
