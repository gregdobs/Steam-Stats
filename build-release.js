#!/usr/bin/env node
// ─────────────────────────────────────────────
// build-release.js
// Assembles a complete, double-click-ready Windows distribution:
//   release/
//     Steam Stats.exe
//     server.js
//     dist/            (built frontend)
//     node_modules/     (production deps only, pruned)
//     Start Steam Stats.bat
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
//    Only server.js's actual runtime imports belong here — NOT the full
//    dependency list from the main package.json, which includes frontend
//    build-time packages (react, vite, etc.) the server never
//    touches at runtime. Keeping this minimal keeps the release small.
console.log('\nInstalling production dependencies into release folder...');
const mainPkgJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const SERVER_RUNTIME_DEPS = ['express', 'cors', 'helmet', 'axios'];
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

// 6b. Generate third-party license notices for everything actually
//     redistributed in this folder — the server's real installed
//     node_modules (whatever npm resolved above, backend + transitive),
//     plus the frontend libraries compiled into dist/'s JS bundle (those
//     never get their own node_modules in the release folder since
//     they're bundled by Vite, so their runtime dependency tree is
//     walked from the main project's node_modules instead). Generated
//     fresh on every build so it can't go stale as dependencies change.
console.log('\nCollecting third-party license notices...');

function listInstalledPackages(nodeModulesDir) {
  const pkgJsonPaths = [];
  if (!fs.existsSync(nodeModulesDir)) return pkgJsonPaths;
  for (const entry of fs.readdirSync(nodeModulesDir)) {
    if (entry.startsWith('.')) continue;
    const entryPath = path.join(nodeModulesDir, entry);
    if (!fs.statSync(entryPath).isDirectory()) continue;
    if (entry.startsWith('@')) {
      for (const scoped of fs.readdirSync(entryPath)) {
        const pkgJsonPath = path.join(entryPath, scoped, 'package.json');
        if (fs.existsSync(pkgJsonPath)) pkgJsonPaths.push(pkgJsonPath);
      }
    } else {
      const pkgJsonPath = path.join(entryPath, 'package.json');
      if (fs.existsSync(pkgJsonPath)) pkgJsonPaths.push(pkgJsonPath);
    }
  }
  return pkgJsonPaths;
}

function collectRuntimeDepTree(rootNodeModules, entryNames) {
  const seen = new Map();
  function visit(name) {
    if (seen.has(name)) return;
    const pkgJsonPath = path.join(rootNodeModules, name, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) return;
    seen.set(name, pkgJsonPath);
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    for (const dep of Object.keys(pkg.dependencies || {})) visit(dep);
  }
  entryNames.forEach(visit);
  return [...seen.values()];
}

function toLicenseEntries(pkgJsonPaths) {
  const entries = [];
  for (const p of pkgJsonPaths) {
    try {
      const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
      const license = pkg.license || (Array.isArray(pkg.licenses) ? pkg.licenses.map(l => l.type).join(' OR ') : 'UNKNOWN');
      entries.push({ name: pkg.name, version: pkg.version, license });
    } catch {}
  }
  return entries;
}

const FRONTEND_BUNDLED_DEPS = ['react', 'react-dom'];
const serverEntries = toLicenseEntries(listInstalledPackages(path.join(RELEASE_DIR, 'node_modules')));
const frontendEntries = toLicenseEntries(collectRuntimeDepTree(path.join(__dirname, 'node_modules'), FRONTEND_BUNDLED_DEPS));

const merged = new Map();
for (const e of [...serverEntries, ...frontendEntries]) merged.set(e.name, e);
const sortedEntries = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));

const noticeLines = [
  'Steam Stats — Third-Party Licenses',
  '===================================',
  '',
  'Steam Stats is MIT-licensed (see LICENSE). It is built with the open-source',
  'packages below, each used under its own license (SPDX identifier shown).',
  'Full license text for any package is available in its own repository, or,',
  "for the server-side packages, under this folder's node_modules/<name>/.",
  '',
  ...sortedEntries.map(e => `  ${e.name}@${e.version} — ${e.license}`),
  '',
];
fs.writeFileSync(path.join(RELEASE_DIR, 'THIRD_PARTY_LICENSES.txt'), noticeLines.join('\n'));
console.log(`✅ Third-party license notice written (${sortedEntries.length} packages)`);

// Also ship the app's own license.
fs.copyFileSync(path.join(__dirname, 'LICENSE'), path.join(RELEASE_DIR, 'LICENSE'));

// 7. Write the launcher — a visible-console .bat. Keeping the console
//    window visible (rather than a hidden tray-icon launcher) is a
//    deliberate simplification: it's the fully verified, zero-extra-
//    dependency path, and it means startup errors are always right there
//    on screen instead of hidden behind a tray icon that might silently
//    fail to appear.
console.log('\nWriting launcher script...');

fs.writeFileSync(path.join(RELEASE_DIR, 'Start Steam Stats.bat'), `@echo off
title Steam Stats
cd /d "%~dp0"
echo Starting Steam Stats...
echo A browser window will open automatically once the server is ready.
echo Close this window to stop the app.
echo.
"Steam Stats.exe"
pause
`);

// 8. Write a short README for the release folder
fs.writeFileSync(path.join(RELEASE_DIR, 'README.txt'), `Steam Stats
===========

HOW TO RUN:
1. Double-click "Start Steam Stats.bat" — a console window opens showing
   startup logs. Your browser opens automatically once the server is ready.

WINDOWS SMARTSCREEN WARNING:
- The first time you run this, Windows will show a blue "Windows protected
  your PC" screen. This is expected — Steam Stats.exe isn't code-signed
  (that costs money and this is a free hobby project), so Windows doesn't
  yet recognize the publisher. Click "More info", then "Run anyway". This
  only appears once per machine.

FIRST-TIME SETUP:
- You'll need a free Steam Web API key from:
  https://steamcommunity.com/dev/apikey
- Your Steam profile must be set to Public
  (Steam > Profile > Edit Profile > Privacy Settings)

STOPPING THE APP:
- Close the console window.

If HowLongToBeat data isn't loading, check Settings > HowLongToBeat inside
the app for diagnostics. Local Steam data (launch counts, session insights)
requires the app to find your Steam installation automatically, or you can
set a custom path in Settings > Local Steam Path.

This folder is self-contained — you can move it anywhere, but keep all the
files together (don't move Steam Stats.exe out on its own). It includes its
own Node.js runtime (node.exe), so nothing else needs to be installed on
this computer.

YOUR DATA / UPDATING TO A NEW RELEASE:
- Your API key, Steam ID, snapshot history, and caches are stored OUTSIDE
  this folder, at %APPDATA%\\SteamStats — not inside "release". That means
  you can safely delete this whole folder and unzip a new release version
  in its place; your data stays put. Settings > Data & Cache > Open Folder
  opens it directly from inside the app.
`);

console.log('\n✅ Release built successfully!');
console.log(`📦 Distributable folder: ${RELEASE_DIR}`);
console.log('\nTo distribute: zip the entire "release" folder and share it.');
console.log('Users unzip it and double-click "Start Steam Stats.bat" — a console window');
console.log('shows startup logs and a browser tab opens automatically.');
