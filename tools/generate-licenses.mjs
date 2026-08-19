// Generates THIRD_PARTY_LICENSES.txt for the packaged app.
//
// Carried over from the old build-release.js, which produced this file for the
// pkg-based release. electron-builder ships Electron's own license but says
// nothing about the npm packages we redistribute, and those are MIT/ISC —
// attribution is an actual condition of the licenses, not a nicety. So this
// keeps being generated fresh on every build, where it can't go stale as
// dependencies change.
//
// Two groups are collected:
//   - server runtime deps, which ship as real node_modules inside the app
//   - frontend deps, which never appear as node_modules because Vite compiles
//     them into dist/'s bundle — their trees are walked from the project's own
//     node_modules instead
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const NODE_MODULES = path.join(ROOT, 'node_modules');

// Mirrors the `files` allowlist in electron-builder.yml. If that list changes,
// change this one too or the notice will describe the wrong set of packages.
const SERVER_RUNTIME_DEPS = ['express', 'cors', 'helmet', 'axios'];
const FRONTEND_BUNDLED_DEPS = ['react', 'react-dom'];

/** Walk a dependency tree from the given entry points, following `dependencies` only. */
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
      const license = pkg.license
        || (Array.isArray(pkg.licenses) ? pkg.licenses.map((l) => l.type).join(' OR ') : 'UNKNOWN');
      entries.push({ name: pkg.name, version: pkg.version, license });
    } catch {}
  }
  return entries;
}

const entries = toLicenseEntries(
  collectRuntimeDepTree(NODE_MODULES, [...SERVER_RUNTIME_DEPS, ...FRONTEND_BUNDLED_DEPS])
);

// Electron is redistributed wholesale, so it belongs in the notice too.
try {
  const electronPkg = JSON.parse(fs.readFileSync(path.join(NODE_MODULES, 'electron', 'package.json'), 'utf8'));
  entries.push({ name: 'electron', version: electronPkg.version, license: electronPkg.license || 'MIT' });
} catch {}

const merged = new Map();
for (const e of entries) merged.set(e.name, e);
const sorted = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));

const lines = [
  'Steam Stats — Third-Party Licenses',
  '===================================',
  '',
  'Steam Stats is MIT-licensed (see LICENSE). It is built with the open-source',
  'packages below, each used under its own license (SPDX identifier shown).',
  'Full license text for any package is available in its own repository.',
  '',
  'Electron additionally bundles Chromium and Node.js; see Electron\'s own',
  'LICENSE and LICENSES.chromium.html, included in this installation.',
  '',
  ...sorted.map((e) => `  ${e.name}@${e.version} — ${e.license}`),
  '',
];

const outDir = path.join(ROOT, 'build');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'THIRD_PARTY_LICENSES.txt');
fs.writeFileSync(outFile, lines.join('\n'));
console.log(`✅ Third-party license notice written (${sorted.length} packages) → ${path.relative(ROOT, outFile)}`);
